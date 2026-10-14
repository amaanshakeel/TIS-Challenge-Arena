import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';

// Test-only HTTP transport backed by disposable PostgreSQL; never deployed or imported by production.
const db=new PGlite();
const admin='40000000-0000-0000-0000-000000000001',student='40000000-0000-0000-0000-000000000002';
await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const name of ['schema.sql','part2.sql'])await db.exec(await readFile(`supabase/${name}`,'utf8'));
for(const [id,name,reg] of [[admin,'TIS Administrator','ADMIN-01'],[student,'Ayesha Khan','CS-001']])await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${reg}@example.test`,JSON.stringify({full_name:name,registration_number:reg,department:'Computing',semester:2})]);
await db.query("update public.profiles set role='admin',status='approved' where id=$1",[admin]);
const rpcFields={admin_overview:[],admin_participants:['p_search','p_status','p_sort','p_page','p_page_size'],admin_change_status:['p_student_id','p_action','p_expected_status'],
  admin_puzzles:['p_search','p_status','p_page','p_page_size'],admin_puzzle:['p_puzzle_id'],
  admin_save_puzzle:['p_puzzle_id','p_title','p_description','p_answer','p_points','p_difficulty','p_status','p_opens_at','p_closes_at','p_case_sensitive','p_expected_updated_at'],
  admin_set_puzzle_status:['p_puzzle_id','p_status','p_expected_updated_at']};
let queue=Promise.resolve();
function asUser(id,callback){const job=queue.then(async()=>{
  await db.exec('set role authenticated');
  try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await callback();}
  finally{await db.exec('reset role');}
});queue=job.catch(()=>{});return job;}
const root=resolve('.'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
let delayDetail=false,releaseDetail=null,profileFailure=false;
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/arena\//,'');
  const json=body=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(body));
  if(path.startsWith('__test/')){
    try{
      if(path==='__test/profile'){if(profileFailure)throw new Error('test_profile_unavailable');const {rows}=await asUser(req.headers['x-test-user'],()=>db.query('select * from public.profiles where id=$1',[req.headers['x-test-user']]));json({data:rows[0]??null,error:null});return;}
      let body='';for await(const chunk of req)body+=chunk;const {name,args}=JSON.parse(body);
      if(!Object.hasOwn(rpcFields,name))throw new Error('invalid_rpc');
      const params=rpcFields[name].map(field=>args[field]??null);
      const {rows}=await asUser(req.headers['x-test-user'],()=>db.query(`select public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as result`,params));
      if(name==='admin_puzzle' && delayDetail)await new Promise(resolve=>{releaseDetail=resolve;});
      json({data:rows[0].result,error:null});
    }catch(error){json({data:null,error:{code:error.code,message:error.message}});}
    return;
  }
  const target=resolve(root,path||'index.html');if(!target.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const content=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]??'text/plain'}).end(content);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/arena/`;
let browser,checks=0;const checked=label=>{console.log('PASS '+label);checks++;};
try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:`
    export function createClient(){const id=()=>sessionStorage.getItem('test-user');
      const request=async(path,body)=>{const r=await fetch(new URL('__test/'+path,location.href),{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-test-user':id()},body:body?JSON.stringify(body):undefined});return r.json();};
      return {auth:{getSession:async()=>({data:{session:id()?{}:null},error:null}),getUser:async()=>({data:{user:id()?{id:id()}:null},error:null}),signOut:async()=>{sessionStorage.removeItem('test-user');return {error:null};},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        from:()=>({select:()=>({eq:()=>({maybeSingle:()=>request('profile')})})}),rpc:(name,args)=>request('rpc',{name,args})};
    }` }));
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'index.html');await page.evaluate(id=>sessionStorage.setItem('test-user',id),admin);
  await page.goto(base+'admin.html');await page.locator('#overview-stats').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-stat=total_registrations]').textContent(),'1');
  checked('overview renders real disposable database counts');
  await page.getByRole('link',{name:'Registrations',exact:true}).click();
  await page.getByRole('button',{name:'Approve Ayesha Khan',exact:true}).waitFor();
  await page.getByRole('button',{name:'Approve Ayesha Khan',exact:true}).click();
  await page.locator('#confirm-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await db.query('select status from public.profiles where id=$1',[student])).rows[0].status,'pending');
  checked('canceling confirmation leaves the database unchanged');
  await page.getByRole('button',{name:'Approve Ayesha Khan',exact:true}).click();
  await page.locator('#confirm-dialog').getByRole('button',{name:'Approve',exact:true}).click();
  await page.locator('#section-registrations [data-feedback]').filter({hasText:'approved'}).waitFor();
  await page.locator('#section-registrations tbody').filter({hasText:'No registrations'}).waitFor();
  checked('approval updates database and refreshes pending list');
  await page.getByRole('link',{name:'Participants',exact:true}).click();
  await page.getByRole('button',{name:'Terminate Ayesha Khan',exact:true}).click();
  await page.locator('#confirm-dialog').getByRole('button',{name:'Terminate',exact:true}).click();
  await page.getByRole('button',{name:'Restore Ayesha Khan',exact:true}).waitFor();
  await page.getByRole('button',{name:'Restore Ayesha Khan',exact:true}).click();
  await page.locator('#confirm-dialog').getByRole('button',{name:'Restore',exact:true}).click();
  await page.getByRole('button',{name:'Terminate Ayesha Khan',exact:true}).waitFor();
  assert.equal((await db.query('select status from public.profiles where id=$1',[student])).rows[0].status,'approved');
  checked('termination and restoration round-trip the saved approved status');
  await page.locator('#participant-search').fill('nonexistent');await page.locator('#section-participants form').getByRole('button',{name:'Search',exact:true}).click();
  await page.locator('#section-participants tbody').filter({hasText:'No participants'}).waitFor();
  checked('search returns a real empty state');
  await page.getByRole('link',{name:'Puzzles',exact:true}).click();await page.locator('#section-puzzles tbody').filter({hasText:'No puzzles'}).waitFor();
  await page.getByRole('button',{name:'Create puzzle',exact:true}).click();await page.getByRole('button',{name:'Save puzzle',exact:true}).click();
  await page.locator('#title-error').filter({hasText:'Enter'}).waitFor();
  assert.equal((await db.query('select count(*)::int as n from public.puzzles')).rows[0].n,0);
  checked('invalid puzzle form does not write to the database');
  await page.locator('#title').fill('Number trail');await page.locator('#description').fill('What comes next?');await page.locator('#correct_answer').fill('42');
  await page.getByRole('button',{name:'Save puzzle',exact:true}).click();await page.getByRole('button',{name:'Edit Number trail',exact:true}).waitFor();
  let puzzle=(await db.query('select * from public.puzzles')).rows[0];
  assert.equal((await db.query('select correct_answer from public.puzzle_answers')).rows[0].correct_answer,'42');
  checked('draft save writes the puzzle and protected answer atomically');
  await page.getByRole('button',{name:'Publish Number trail',exact:true}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Publish',exact:true}).click();
  await page.getByRole('button',{name:'Close Number trail',exact:true}).waitFor();
  assert.equal((await asUser(student,()=>db.query('select id from public.puzzles'))).rows.length,1);
  await page.getByRole('button',{name:'Close Number trail',exact:true}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Publish Number trail',exact:true}).waitFor();
  assert.equal((await asUser(student,()=>db.query('select id from public.puzzles'))).rows.length,0);
  checked('publish and close update approved-student database access');
  await db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values($1,$2,'wrong',false,0)",[student,puzzle.id]);
  await page.getByRole('button',{name:'Edit Number trail',exact:true}).click();await page.locator('#puzzle-dialog').waitFor({state:'visible'});
  for(const field of ['points','correct_answer','case_sensitive'])assert.equal(await page.locator('#'+field).isDisabled(),true);
  await page.locator('#title').fill('Updated number trail');await page.getByRole('button',{name:'Save puzzle',exact:true}).click();
  await page.getByRole('button',{name:'Edit Updated number trail',exact:true}).waitFor();
  checked('recorded attempts lock scoring fields while content stays editable');
  await page.getByRole('button',{name:'Edit Updated number trail',exact:true}).click();
  await page.locator('#puzzle-dialog').waitFor({state:'visible'});
  await queue;await db.query("update public.puzzles set title='Concurrent edit' where id=$1",[puzzle.id]);
  await page.locator('#title').fill('Stale title');await page.getByRole('button',{name:'Save puzzle',exact:true}).click();
  await page.locator('#puzzle-notice').filter({hasText:'changed since'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save puzzle',exact:true}).isDisabled(),false);
  assert.equal((await db.query('select title from public.puzzles where id=$1',[puzzle.id])).rows[0].title,'Concurrent edit');
  await page.locator('#puzzle-dialog [data-cancel]').click();
  checked('stale saves show an actionable error and preserve newer data');
  delayDetail=true;profileFailure=true;
  const detailRequested=page.waitForRequest(request=>request.url().includes('__test/rpc')&&request.postDataJSON()?.name==='admin_puzzle');
  await page.getByRole('button',{name:'Edit Updated number trail',exact:true}).click();await detailRequested;
  // The detail query already passed DB authorization; delay delivery until a new guard check fails.
  while(!releaseDetail)await new Promise(resolve=>setTimeout(resolve,5));
  await page.getByRole('button',{name:'Recheck access',exact:true}).click();
  await page.locator('#notice').filter({hasText:'could not complete'}).waitFor();
  const detailResponse=page.waitForResponse(response=>response.url().includes('__test/rpc')&&response.request().postDataJSON()?.name==='admin_puzzle');
  releaseDetail();await detailResponse;
  await page.waitForFunction(()=>!document.querySelector('[data-create]').disabled);
  assert.equal(await page.locator('#puzzle-dialog').isVisible(),false,'A delayed answer response must not reopen the editor after access is blocked');
  checked('delayed protected answers cannot reopen an editor after failed access checks');
  delayDetail=false;profileFailure=false;
  await page.getByRole('button',{name:'Recheck access',exact:true}).click();await page.locator('#protected-content').waitFor({state:'visible'});
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:950});
    for(const name of ['overview','registrations','participants','puzzles','rankings']){
      await page.locator(`[data-section-link=${name}]`).click();await page.locator(`#section-${name}`).waitFor({state:'visible'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflows at ${width}`);
    }
    checked(`all admin sections fit ${width}px with controlled table scrolling`);
  }
  await mkdir('test-results',{recursive:true});await page.locator('[data-section-link=overview]').click();await page.locator('#overview-stats').waitFor({state:'visible'});
  await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:950});
  await page.locator('[data-section-link=puzzles]').click();await page.getByRole('button',{name:'Create puzzle',exact:true}).click();
  assert.ok((await page.locator('#puzzle-dialog-title').boundingBox()).y >= (await page.locator('#puzzle-dialog').boundingBox()).y,'Editor heading must be visible when opened on mobile');
  await page.screenshot({path:'test-results/admin-editor-mobile.png',fullPage:true});await page.locator('#puzzle-dialog [data-cancel]').click();
  assert.deepEqual(errors,[]);checked('no browser JavaScript errors');
  await queue;await db.query("update public.profiles set status='terminated' where id=$1",[admin]);
  await page.getByRole('button',{name:'Refresh puzzles',exact:true}).click();await page.waitForURL('**/account.html');
  await page.getByRole('heading',{name:'Access restricted',exact:true}).waitFor();
  checked('database revocation removes existing admin session access');
  console.log(`${checks} admin browser checks passed against disposable PostgreSQL. Supabase Auth remains a fixture.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await db.close();}
