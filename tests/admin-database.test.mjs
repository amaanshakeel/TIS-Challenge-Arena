import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin='30000000-0000-0000-0000-000000000001';
const student='30000000-0000-0000-0000-000000000002';
const rejected='30000000-0000-0000-0000-000000000003';

test('Part 2 RPCs enforce trusted administrative operations',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/part2.sql',import.meta.url),'utf8'));
  for(const [id,name,reg] of [[admin,'Admin','ADMIN-01'],[student,'Zara Ali','CS-001'],[rejected,'Ahmed Khan','CS-002']]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,reg+'@example.test',JSON.stringify({full_name:name,registration_number:reg,department:'Computing',semester:2})]);
  }
  await db.query("update public.profiles set role='admin',status='approved' where id=$1",[admin]);
  await db.query("update public.profiles set status='rejected' where id=$1",[rejected]);
  async function as(role,id,sql,params=[]){
    await db.exec(`set role ${role}`);
    try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);return await db.query(sql,params);}
    finally{await db.exec('reset role');}
  }
  async function call(name,args=[],role='authenticated',id=admin){
    const sql=`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`;
    return (await as(role,id,sql,args)).rows[0].result;
  }
  const change=(id,action,expected)=>call('admin_change_status',[id,action,expected]);
  let saved;
  const save=(overrides={})=>call('admin_save_puzzle',[
    overrides.id??null,overrides.title??'A logic puzzle',overrides.description??'What follows the pattern?',
    Object.hasOwn(overrides,'answer')?overrides.answer:'42',overrides.points??20,overrides.difficulty??'easy',overrides.status??'draft',
    overrides.opens_at??null,overrides.closes_at??null,overrides.case_sensitive??false,overrides.version??null,
  ]);
  await t.test('anonymous callers and every student status cannot call administrative RPCs',async()=>{
    await assert.rejects(call('admin_overview',[],'anon',null),/permission denied/);
    for(const status of ['pending','approved','rejected','terminated']){
      await db.query('update public.profiles set status=$1 where id=$2',[status,student]);
      for(const [name,args] of [['admin_overview',[]],['admin_participants',['','','newest',1,20]],['admin_change_status',[student,'approve',status]],['admin_puzzles',['','',1,20]],['admin_puzzle',[student]],['admin_save_puzzle',[null,'Title','Text','42',20,'easy','draft',null,null,false,null]],['admin_set_puzzle_status',[student,'published',null]]]) {
        await assert.rejects(call(name,args,'authenticated',student),/admin_required/);
      }
    }
    await db.query("update public.profiles set status='pending' where id=$1",[student]);
  });
  await t.test('overview returns actual counts excluding the admin account',async()=>{
    const stats=await call('admin_overview');
    assert.equal(stats.total_registrations,2);assert.equal(stats.pending,1);assert.equal(stats.rejected,1);assert.equal(stats.total_puzzles,0);
  });
  await t.test('search/filter/sort/pagination are stable, bounded and literal',async()=>{
    const page=await call('admin_participants',['','', 'name',1,1]);
    assert.equal(page.total,2);assert.equal(page.rows[0].full_name,'Ahmed Khan');
    assert.equal((await call('admin_participants',['CS-001','pending','newest',1,20])).rows[0].id,student);
    assert.equal((await call('admin_participants',['%','', 'newest',1,20])).total,0);
    assert.equal((await call('admin_participants',['','', 'name',2,1])).rows[0].id,student);
    await assert.rejects(call('admin_participants',['','', 'unsafe',1,20]),/invalid_input/);
    await assert.rejects(call('admin_participants',['','', 'name',1,1000]),/invalid_input/);
  });
  await t.test('approve/reject validate state and reject stale requests',async()=>{
    assert.equal((await change(student,'approve','pending')).status,'approved');
    await assert.rejects(change(student,'reject','pending'),/stale_record/);
    await assert.rejects(change(student,'reject','approved'),/invalid_transition/);
    await assert.rejects(change(admin,'terminate','approved'),/student_required/);
    assert.equal((await change(rejected,'approve','rejected')).status,'approved');
  });
  await t.test('termination/restoration preserve approval and cannot silently approve pending/rejected students',async()=>{
    for(const before of ['approved','pending','rejected']){
      await db.query('update public.profiles set status=$1 where id=$2',[before,student]);
      assert.equal((await change(student,'terminate',before)).status,'terminated');
      assert.equal((await change(student,'restore','terminated')).status,before);
    }
    await db.query("update public.profiles set status='terminated',status_before_termination=null where id=$1",[student]);
    await assert.rejects(change(student,'restore','terminated'),/restoration_unavailable/);
    await db.query("update public.profiles set status='pending' where id=$1",[student]);
    assert.equal((await change(student,'reject','pending')).status,'rejected');
  });
  await t.test('draft creation writes protected answer atomically and audit records omit answers',async()=>{
    saved=await save();assert.equal(saved.status,'draft');
    const detail=await call('admin_puzzle',[saved.id]);assert.equal(detail.correct_answer,'42');
    const list=await call('admin_puzzles',['','',1,20]);assert.equal(list.total,1);assert.equal(list.rows[0].correct_answer,undefined);
    assert.equal((await as('authenticated',student,'select * from public.puzzle_answers')).rows.length,0);
    const audits=(await as('authenticated',admin,'select details from public.admin_audit')).rows;
    assert.doesNotMatch(JSON.stringify(audits),/correct_answer|"42"/);
  });
  await t.test('bad puzzle input is rejected without partial writes',async()=>{
    for(const input of [{points:0},{title:' '},{answer:' '},{difficulty:'extreme'},{status:'bad'},{opens_at:'2026-10-20',closes_at:'2026-10-19'},{opens_at:'infinity'}]) await assert.rejects(save(input),/invalid_input/);
    assert.equal((await call('admin_overview')).total_puzzles,1);
  });
  await t.test('editing requires a fresh version and preserves creator; answer omission keeps the protected answer',async()=>{
    await assert.rejects(save({id:saved.id,version:'2000-01-01',title:'Stale edit'}),/stale_record/);
    saved=await save({id:saved.id,version:saved.updated_at,title:'Updated title',answer:null});
    assert.equal(saved.title,'Updated title');assert.equal(saved.created_by,admin);
    assert.equal((await call('admin_puzzle',[saved.id])).correct_answer,'42');
    await assert.rejects(save({id:saved.id,title:'Missing version'}),/stale_record/);
  });
  await t.test('publishing/closing hide closed puzzles and reject stale changes',async()=>{
    const before=saved.updated_at;
    saved=await call('admin_set_puzzle_status',[saved.id,'published',saved.updated_at]);
    await db.query("update public.profiles set status='approved' where id=$1",[student]);
    assert.equal((await as('authenticated',student,'select id from public.puzzles')).rows.length,1);
    await assert.rejects(call('admin_set_puzzle_status',[saved.id,'closed',before]),/stale_record/);
    saved=await call('admin_set_puzzle_status',[saved.id,'closed',saved.updated_at]);
    assert.equal((await as('authenticated',student,'select id from public.puzzles')).rows.length,0);
    await assert.rejects(call('admin_set_puzzle_status',[saved.id,'bogus',saved.updated_at]),/invalid_input/);
  });
  await t.test('any recorded attempt locks answer/case/points while content and publication remain editable',async()=>{
    await db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values ($1,$2,'wrong',false,0)",[student,saved.id]);
    for(const input of [{points:21},{answer:'43'},{case_sensitive:true}]) await assert.rejects(save({id:saved.id,version:saved.updated_at,...input}),/scoring_locked/);
    saved=await save({id:saved.id,version:saved.updated_at,title:'Clarified title'});
    assert.equal((await call('admin_puzzle',[saved.id])).scoring_locked,true);
    assert.equal((await call('admin_overview')).total_attempts,1);
    await change(student,'terminate','approved');
    assert.equal((await as('authenticated',admin,'select * from public.submissions')).rows.length,1);
    assert.equal((await call('admin_overview')).terminated,1);
  });
  await t.test('privileged endpoints recheck current admin status and client table writes remain denied',async()=>{
    await assert.rejects(as('authenticated',admin,"update public.profiles set status='approved'"),/permission denied/);
    await assert.rejects(as('authenticated',admin,"insert into public.puzzles(title) values ('x')"),/permission denied/);
    await db.query("update public.profiles set status='terminated' where id=$1",[admin]);
    await assert.rejects(call('admin_overview'),/admin_required/);
    await assert.rejects(call('admin_puzzle',[saved.id]),/admin_required/);
  });
});
