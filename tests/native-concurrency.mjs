import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createServer} from 'node:net';
import {platform,arch} from 'node:os';
import pg from 'pg';
import assert from 'node:assert/strict';

// Development-only native PostgreSQL, bound to loopback with a unique ignored data directory.
const binaries=await import(`@embedded-postgres/${platform()==='win32'?'windows':platform()}-${arch()}`);
const testRoot=resolve('test-results');await mkdir(testRoot,{recursive:true});
const directory=await mkdtemp(resolve(testRoot,'pg-concurrency-'));
assert.ok(directory.startsWith(testRoot+sep),'Cluster directory must remain in test-results');
const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
function run(file,args){return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(output)));});}
const clients=[];let server;
try{
  await run(binaries.initdb,['-D',directory,'--username=postgres','--auth=trust','--encoding=UTF8','--locale=C']);
  server=spawn(binaries.postgres,['-D',directory,'-p',String(port),'-h','127.0.0.1'],{windowsHide:true});
  await new Promise((resolve,reject)=>{let logs='';const timeout=setTimeout(()=>reject(new Error('Native PostgreSQL startup timeout: '+logs)),15000);server.stderr.on('data',data=>{logs+=data;if(logs.includes('ready to accept connections')){clearTimeout(timeout);resolve();}});server.on('error',reject);server.on('exit',code=>{clearTimeout(timeout);reject(new Error(`PostgreSQL exited ${code}: ${logs}`));});});
  async function connect(id=null){const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await client.connect();clients.push(client);if(id){await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}return client;}
  const owner=await connect(),monitor=await connect();
  await owner.query(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of ['schema.sql','part2.sql','part3.sql','visual-puzzles.sql'])await owner.query(await readFile(`supabase/${file}`,'utf8'));
  const a='60000000-0000-0000-0000-000000000001',b='60000000-0000-0000-0000-000000000002',admin='60000000-0000-0000-0000-000000000003';
  for(const [id,reg] of [[a,'A'],[b,'B'],[admin,'ADMIN']])await owner.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${reg}@example.test`,JSON.stringify({full_name:`User ${reg}`,registration_number:reg,department:'Computing',semester:2})]);
  await owner.query("update public.profiles set status='approved'");await owner.query("update public.profiles set role='admin' where id=$1",[admin]);
  const puzzle=(await owner.query("insert into public.puzzles(title,description,points,status,created_by) values('Concurrent puzzle','Find the answer',25,'published',$1) returning *",[admin])).rows[0];
  await owner.query("insert into public.puzzle_answers(puzzle_id,correct_answer) values($1,'42')",[puzzle.id]);
  const first=await connect(a),second=await connect(a),third=await connect(b);
  const submit=(client,id)=>client.query('select public.submit_answer($1,$2) as result',[id,'42']);
  async function blocked(count,pattern='submit_answer'){for(let i=0;i<200;i++){const {rows}=await monitor.query("select count(*)::int as n from pg_stat_activity where wait_event_type='Lock' and query like $1",['%'+pattern+'%']);if(rows[0].n>=count)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected overlapping locked transactions did not appear');}
  await owner.query('begin');await owner.query('select id from public.profiles where id=$1 for update',[a]);
  const one=submit(first,puzzle.id),two=submit(second,puzzle.id);await blocked(2);await owner.query('commit');
  const results=await Promise.all([one,two]);assert.deepEqual(results.map(r=>r.rows[0].result.outcome).sort(),['already_solved','correct']);
  assert.equal((await owner.query('select sum(awarded_points)::int as points,count(*)::int as attempts from public.submissions where student_id=$1',[a])).rows[0].points,25);
  assert.equal((await owner.query('select count(*)::int as n from public.submissions where student_id=$1',[a])).rows[0].n,1);
  console.log('PASS overlapping separate-connection correct submissions award exactly once');

  await owner.query('begin');await owner.query('select id from public.puzzles where id=$1 for update',[puzzle.id]);
  const closing=submit(third,puzzle.id);await blocked(1);await owner.query("update public.puzzles set status='closed' where id=$1",[puzzle.id]);await owner.query('commit');
  assert.equal((await closing).rows[0].result.outcome,'puzzle_unavailable');
  console.log('PASS closure wins a puzzle-lock race without recording points');

  const editable=(await owner.query("insert into public.puzzles(title,description,points,status,created_by) values('Editable puzzle','Find the answer',25,'published',$1) returning *,updated_at::text as version",[admin])).rows[0];
  await owner.query("insert into public.puzzle_answers(puzzle_id,correct_answer) values($1,'42')",[editable.id]);
  await owner.query('begin');await owner.query('select id from public.puzzles where id=$1 for update',[editable.id]);
  const editing=submit(third,editable.id);await blocked(1);await owner.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await owner.query('select public.admin_save_puzzle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[editable.id,editable.title,editable.description,null,50,null,'published',null,null,false,editable.version]);await owner.query('commit');
  assert.equal((await editing).rows[0].result.awarded_points,50);
  console.log('PASS submit waits for admin edit and uses the committed point snapshot');

  await owner.query('begin');await owner.query("update public.profiles set status='terminated' where id=$1",[b]);
  const terminating=submit(third,puzzle.id).then(()=>({unexpected:true}),error=>error);await blocked(1);await owner.query('commit');
  assert.match((await terminating).message,/student_not_eligible/);
  assert.equal((await owner.query('select sum(awarded_points)::int as points from public.submissions where student_id=$1',[b])).rows[0].points,50);
  console.log('PASS termination wins a profile-lock race and preserves prior scores');

  const expiring=(await owner.query("insert into public.puzzles(title,description,points,status,created_by) values('Expiring puzzle','Find the answer',10,'published',$1) returning *",[admin])).rows[0];
  await owner.query("insert into public.puzzle_answers(puzzle_id,correct_answer) values($1,'42')",[expiring.id]);
  await owner.query('begin');await owner.query("update public.puzzles set closes_at=clock_timestamp()+interval '100 milliseconds' where id=$1",[expiring.id]);
  const expiry=submit(first,expiring.id);await blocked(1);await new Promise(resolve=>setTimeout(resolve,150));await owner.query('commit');
  assert.equal((await expiry).rows[0].result.outcome,'puzzle_unavailable');
  console.log('PASS availability is revalidated after waiting on a puzzle lock');
  const settings=(await owner.query('select public.admin_arena() as result')).rows[0].result,config=structuredClone(settings.config),questionIds=[];
  for(const title of ['Opening race question','Final race question']){
    const id=(await owner.query("insert into public.puzzles(title,description,points,status,created_by) values($1,'Find the answer',10,'published',$2) returning id",[title,admin])).rows[0].id;
    await owner.query("insert into public.puzzle_answers(puzzle_id,correct_answer) values($1,'42')",[id]);questionIds.push(id);
  }
  config.opening_question_ids=[questionIds[0]];config.final_question_ids=[questionIds[1]];config.enabled=true;
  await owner.query('select public.admin_save_arena($1,$2)',[JSON.stringify(config),settings.updated_at]);await submit(first,questionIds[0]);
  const start=client=>client.query('select public.arena_start(2) as result');
  await owner.query('begin');await owner.query('select id from public.profiles where id=$1 for update',[a]);
  const startOne=start(first),startTwo=start(second);await blocked(2,'arena_start');await owner.query('commit');
  const starts=await Promise.all([startOne,startTwo]);assert.equal(starts[0].rows[0].result.expires_at,starts[1].rows[0].result.expires_at);
  assert.equal((await owner.query('select count(*)::int n from private.arena_attempts where student_id=$1 and level=2',[a])).rows[0].n,1);
  console.log('PASS simultaneous visual starts create one attempt with one deadline');
  let attempt=starts[0].rows[0].result;
  const move=(client,piece,slot,revision,level=2)=>client.query('select public.arena_move($1,$2,$3) as result',[level,JSON.stringify({piece,slot}),revision]);
  await owner.query('begin');await owner.query('select id from public.profiles where id=$1 for update',[a]);
  const moveOne=move(first,0,0,0),moveTwo=move(second,1,1,0);await blocked(2,'arena_move');await owner.query('commit');
  const moves=await Promise.all([moveOne,moveTwo]);assert.deepEqual(moves.map(r=>r.rows[0].result.outcome).sort(),['ok','stale_move']);
  attempt=moves[0].rows[0].result;assert.equal(attempt.revision,1);
  console.log('PASS simultaneous same-revision moves reconcile without overwriting');
  for(let piece=0;piece<15;piece++)attempt=(await move(first,piece,piece,attempt.revision)).rows[0].result;
  await owner.query('begin');await owner.query('select id from public.profiles where id=$1 for update',[a]);
  const finishOne=move(first,15,15,attempt.revision),finishTwo=move(second,15,15,attempt.revision);await blocked(2,'arena_move');await owner.query('commit');
  const finishes=await Promise.all([finishOne,finishTwo]);assert.ok(finishes.every(r=>r.rows[0].result.status==='completed'));
  assert.equal((await owner.query('select count(*)::int n from public.submissions where student_id=$1 and puzzle_id=$2 and is_correct',[a,config.levels[1].puzzle_id])).rows[0].n,1);
  console.log('PASS simultaneous final placements award visual points exactly once');
  const robot=(await first.query('select public.arena_start(3) as result')).rows[0].result;
  await owner.query('begin');await owner.query("update private.arena_attempts set expires_at=clock_timestamp()+interval '100 milliseconds' where student_id=$1 and level=3",[a]);
  const late=move(first,0,0,robot.revision,3);await blocked(1,'arena_move');await new Promise(resolve=>setTimeout(resolve,150));await owner.query('commit');
  assert.equal((await late).rows[0].result.status,'expired');
  console.log('PASS visual deadline is rechecked after waiting for a locked attempt');
  console.log('9 native PostgreSQL concurrency checks passed on separate connections.');
}finally{
  await Promise.allSettled(clients.map(client=>client.query('rollback').then(()=>client.end())));
  if(server&&server.exitCode===null)await run(binaries.pg_ctl,['-D',directory,'stop','-m','fast','-w']);
}
