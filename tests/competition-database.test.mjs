import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ids={admin:'50000000-0000-0000-0000-000000000001',a:'50000000-0000-0000-0000-000000000002',b:'50000000-0000-0000-0000-000000000003',pending:'50000000-0000-0000-0000-000000000004'};
test('Part 3 enforces scoring, access and consistent private/public rankings',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const name of ['schema.sql','part2.sql','part3.sql'])await db.exec(await readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8'));
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${name}@example.test`,JSON.stringify({full_name:`Student ${name}`,registration_number:`REG-${name}`,department:'Computing',semester:2})]);
  await db.query("update public.profiles set status='approved' where id=any($1::uuid[])",[[ids.admin,ids.a,ids.b]]);
  await db.query("update public.profiles set role='admin' where id=$1",[ids.admin]);
  const puzzles=[];
  for(const title of ['Logic','Case sensitive','Draft','Closed','Future','Expired','Rate limit']){
    const {rows}=await db.query('insert into public.puzzles(title,description,points,status,created_by) values($1,$2,25,$3,$4) returning id',[title,'Solve this puzzle.',title==='Draft'?'draft':title==='Closed'?'closed':'published',ids.admin]);
    puzzles.push(rows[0].id);await db.query('insert into public.puzzle_answers(puzzle_id,correct_answer,case_sensitive) values($1,$2,$3)',[rows[0].id,'Forty Two',title==='Case sensitive']);
  }
  await db.query("update public.puzzles set opens_at=clock_timestamp()+interval '1 hour' where id=$1",[puzzles[4]]);
  await db.query("update public.puzzles set closes_at=clock_timestamp()-interval '1 hour' where id=$1",[puzzles[5]]);
  async function as(role,id,sql,args=[]){await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);return await db.query(sql,args);}finally{await db.exec('reset role');}}
  const call=async(name,args=[],id=ids.a,role='authenticated')=>(await as(role,id,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  await t.test('only approved students can access competition RPCs and submit',async()=>{
    await assert.rejects(call('submit_answer',[puzzles[0],'Forty Two'],null,'anon'),/permission denied/);
    await assert.rejects(call('student_overview',[],ids.admin),/student_not_eligible/);
    for(const status of ['pending','rejected','terminated']){
      await db.query('update public.profiles set status=$1 where id=$2',[status,ids.pending]);
      for(const [name,args] of [['student_overview',[]],['student_puzzles',[1,20]],['submit_answer',[puzzles[0],'Forty Two']]])await assert.rejects(call(name,args,ids.pending),/student_not_eligible/);
    }
    await assert.rejects(call('student_overview',[],null),/authentication_required/);
  });
  await t.test('student puzzle lists include only available content and own state, never answers',async()=>{
    const data=await call('student_puzzles',[1,20]);assert.equal(data.total,3);
    assert.equal(data.rows[0].correct_answer,undefined);assert.equal(data.rows[0].attempt_count,0);
    assert.equal((await as('authenticated',ids.a,'select * from public.puzzle_answers')).rows.length,0);
  });
  await t.test('unavailable or missing puzzles cannot record or score an attempt',async()=>{
    for(const id of puzzles.slice(2,6))assert.equal((await call('submit_answer',[id,'Forty Two'])).outcome,'puzzle_unavailable');
    assert.equal((await call('submit_answer',['99999999-0000-0000-0000-000000000001','Forty Two'])).outcome,'puzzle_unavailable');
    assert.equal((await db.query('select count(*)::int as n from public.submissions')).rows[0].n,0);
  });
  await t.test('invalid answers are rejected; incorrect attempts record zero points',async()=>{
    for(const answer of [' ','x'.repeat(501)])await assert.rejects(call('submit_answer',[puzzles[0],answer]),/invalid_answer/);
    const result=await call('submit_answer',[puzzles[0],'Forty  Two']);assert.deepEqual(result,{outcome:'incorrect',awarded_points:0});
    assert.equal((await call('student_overview')).points,0);
  });
  await t.test('outer whitespace and case normalization award a trusted point snapshot once',async()=>{
    const result=await call('submit_answer',[puzzles[0],'\t forty two \n']);assert.equal(result.outcome,'correct');assert.equal(result.awarded_points,25);
    assert.deepEqual(await call('submit_answer',[puzzles[0],'anything']),{outcome:'already_solved',awarded_points:0});
    const rows=(await db.query('select awarded_points,is_correct from public.submissions where student_id=$1',[ids.a])).rows;
    assert.equal(rows.length,2);assert.equal(rows.reduce((n,row)=>n+row.awarded_points,0),25);
  });
  await t.test('case-sensitive puzzles distinguish case without aggressive internal normalization',async()=>{
    assert.equal((await call('submit_answer',[puzzles[1],'forty two'])).outcome,'incorrect');
    assert.equal((await call('submit_answer',[puzzles[1],'  Forty Two  '])).outcome,'correct');
  });
  await t.test('all boards share totals and equal rank rules; public projection contains no private fields',async()=>{
    await call('submit_answer',[puzzles[0],'Forty Two'],ids.b);await call('submit_answer',[puzzles[1],'Forty Two'],ids.b);
    const board=await call('public_leaderboard',[1,20],null,'anon');assert.equal(board.total,2);assert.deepEqual(board.rows.map(row=>row.rank),[1,1]);
    for(const row of board.rows)assert.deepEqual(Object.keys(row).sort(),['display_name','points','rank','solved_count']);
    assert.equal((await call('student_overview')).points,50);assert.equal((await call('student_overview')).rank,1);
    const admin=await call('admin_rankings',[1,20],ids.admin);assert.deepEqual(admin.rows.map(row=>row.points),board.rows.map(row=>row.points));assert.ok(admin.rows[0].registration_number);
    await assert.rejects(call('admin_rankings',[1,20]),/admin_required/);
    assert.equal((await call('public_leaderboard',[2,1],null,'anon')).rows.length,1);
    await db.query("update public.profiles set status='approved' where id=$1",[ids.pending]);
    assert.deepEqual((await call('public_leaderboard',[1,20],null,'anon')).rows.map(row=>row.rank),[1,1,3]);
    await db.query("update public.profiles set status='terminated' where id=$1",[ids.pending]);
    await assert.rejects(call('public_leaderboard',[0,20],null,'anon'),/invalid_input/);
  });
  await t.test('trusted rate limit bounds repeated wrong attempts and records no blocked attempt',async()=>{
    for(let i=0;i<20;i++)await call('submit_answer',[puzzles[6],'wrong'],ids.b);
    const before=(await db.query('select count(*)::int as n from public.submissions where student_id=$1',[ids.b])).rows[0].n;
    const result=await call('submit_answer',[puzzles[6],'Forty Two'],ids.b);assert.equal(result.outcome,'rate_limited');assert.ok(result.retry_after_seconds>0);
    assert.equal((await db.query('select count(*)::int as n from public.submissions where student_id=$1',[ids.b])).rows[0].n,before);
    await db.query("update public.submissions set submitted_at=clock_timestamp()-interval '2 minutes' where student_id=$1",[ids.b]);
    assert.equal((await call('submit_answer',[puzzles[6],'Forty Two'],ids.b)).outcome,'correct');
  });
  await t.test('duplicate successful requests cannot produce another award and history survives termination',async()=>{
    const result=await call('submit_answer',[puzzles[0],'Forty Two']);assert.equal(result.outcome,'already_solved');
    const total=(await call('student_overview')).points;
    await call('admin_change_status',[ids.a,'terminate','approved'],ids.admin);
    await assert.rejects(call('submit_answer',[puzzles[6],'Forty Two']),/student_not_eligible/);
    const board=await call('public_leaderboard',[1,20],null,'anon');assert.equal(board.total,1);
    assert.equal((await db.query('select sum(awarded_points)::int as total from public.submissions where student_id=$1',[ids.a])).rows[0].total,total);
    await call('admin_change_status',[ids.a,'restore','terminated'],ids.admin);assert.equal((await call('student_overview')).points,total);
  });
  await t.test('clients cannot alter attempts, points or ranking views directly',async()=>{
    for(const sql of ["insert into public.submissions(id) values(gen_random_uuid())",'update public.submissions set awarded_points=999','delete from public.submissions','select * from private.competition_ranks'])await assert.rejects(as('authenticated',ids.a,sql),/permission denied/);
    const detail=await call('admin_puzzle',[puzzles[0]],ids.admin);
    await assert.rejects(call('admin_save_puzzle',[detail.id,detail.title,detail.description,'different',detail.points,detail.difficulty,detail.status,null,null,false,detail.updated_at],ids.admin),/scoring_locked/);
  });
});
