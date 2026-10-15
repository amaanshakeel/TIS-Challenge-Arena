import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function competitionHarness({visual=false,attemptLimit=false,timedProgression=false}={}) {
  const db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of ['schema.sql','part2.sql','part3.sql'])await db.exec(await readFile(`supabase/${file}`,'utf8'));
  if(visual)await db.exec(await readFile('supabase/visual-puzzles.sql','utf8'));
  if(attemptLimit)await db.exec(await readFile('supabase/question-attempt-limit.sql','utf8'));
  if(timedProgression)await db.exec(await readFile('supabase/timed-level-progression.sql','utf8'));
  const admin='70000000-0000-0000-0000-000000000001';
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[admin,'admin@example.test',JSON.stringify({full_name:'TIS Administrator',registration_number:'ADMIN-01',department:'Computing',semester:2})]);
  await db.query("update public.profiles set role='admin',status='approved' where id=$1",[admin]);
  const fields={admin_overview:[],admin_participants:['p_search','p_status','p_sort','p_page','p_page_size'],admin_change_status:['p_student_id','p_action','p_expected_status'],admin_puzzles:['p_search','p_status','p_page','p_page_size'],admin_puzzle:['p_puzzle_id'],admin_save_puzzle:['p_puzzle_id','p_title','p_description','p_answer','p_points','p_difficulty','p_status','p_opens_at','p_closes_at','p_case_sensitive','p_expected_updated_at'],admin_set_puzzle_status:['p_puzzle_id','p_status','p_expected_updated_at'],submit_answer:['p_puzzle_id','p_answer'],student_overview:[],student_puzzles:['p_page','p_page_size'],public_leaderboard:['p_page','p_page_size'],admin_rankings:['p_page','p_page_size']};
  Object.assign(fields,{admin_arena:[],admin_save_arena:['p_config','p_expected_updated_at'],arena_progress:[],arena_start:['p_level'],arena_move:['p_level','p_move','p_revision']});
  fields.question_status=['p_puzzle_id'];
  let queue=Promise.resolve();
  function owner(callback){const task=queue.then(callback);queue=task.catch(()=>{});return task;}
  function asUser(id,callback){return owner(async()=>{await db.exec(`set role ${id?'authenticated':'anon'}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);return await callback();}finally{await db.exec('reset role');}});}
  async function rpc(name,args,id){const params=fields[name].map(field=>args[field]??null);return (await asUser(id,()=>db.query(`select public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as result`,params))).rows[0].result;}
  const root=resolve('.'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpeg':'image/jpeg','.png':'image/png'};
  const server=createServer(async(req,res)=>{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/arena\//,'');
    const json=body=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(body));
    if(path.startsWith('__test/')){
      try{
        const id=req.headers['x-test-user']==='null'?null:req.headers['x-test-user'];
        if(path==='__test/profile'){const {rows}=await asUser(id,()=>db.query('select * from public.profiles where id=$1',[id]));json({data:rows[0]??null,error:null});return;}
        let input='';for await(const chunk of req)input+=chunk;const body=JSON.parse(input);
        if(path==='__test/signup'){
          const uid=randomUUID();await owner(()=>db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[uid,body.email,JSON.stringify(body.options.data)]));
          json({data:{user:{id:uid,identities:[{}]},session:null},error:null});return;
        }
        if(path==='__test/login'){const {rows}=await owner(()=>db.query('select id from auth.users where email=$1',[body.email]));if(!rows.length)throw {code:'invalid_credentials'};json({data:{user:rows[0],session:{}},error:null});return;}
        if(!Object.hasOwn(fields,body.name))throw {code:'invalid_rpc'};
        json({data:await rpc(body.name,body.args,id),error:null});
      }catch(error){json({data:null,error:{code:error.code,message:error.message}});}
      return;
    }
    const target=resolve(root,path||'index.html');if(!target.startsWith(root+sep)){res.writeHead(403).end();return;}
    try{const body=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]??'text/plain'}).end(body);}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/arena/`;
  async function fixture(context){await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:`
    export function createClient(){const id=()=>sessionStorage.getItem('test-user');
      const request=async(path,body)=>{const response=await fetch(new URL('__test/'+path,location.href),{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-test-user':id()},body:body?JSON.stringify(body):undefined});return response.json();};
      return {auth:{getSession:async()=>({data:{session:id()?{}:null},error:null}),getUser:async()=>({data:{user:id()?{id:id()}:null},error:null}),signUp:args=>request('signup',args),signInWithPassword:async(args)=>{const result=await request('login',args);if(!result.error)sessionStorage.setItem('test-user',result.data.user.id);return result;},signOut:async()=>{sessionStorage.removeItem('test-user');return {error:null};},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:()=>request('profile')})})}),rpc:(name,args)=>request('rpc',{name,args})};
    }` }));}
  return {db,admin,base,fixture,owner,rpc,asUser,async close(){await queue;await new Promise(resolve=>server.close(resolve));await db.close();}};
}
