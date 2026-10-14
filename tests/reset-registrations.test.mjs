import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {competitionHarness} from './helpers/competition-harness.mjs';

for(const visual of[false,true])test(`student reset works as one SQL statement (visual extension ${visual})`,async t=>{
  const h=await competitionHarness({visual});t.after(()=>h.close());const uid=randomUUID(),pending=randomUUID();
  const metadata=JSON.stringify({full_name:'Reset Student',registration_number:'RESET-1',department:'Computing',semester:2});
  await h.owner(async()=>{await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[uid,'reset@example.test',metadata]);await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[pending,'pending@example.test',JSON.stringify({full_name:'Pending Student',registration_number:'RESET-2',department:'Computing',semester:2})]);await h.db.query("update public.profiles set status='approved' where id=$1",[uid]);});
  const admin=(name,args={})=>h.rpc(name,args,h.admin),questions=[];
  for(const title of['Reset opening','Reset final'])questions.push((await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:title,p_description:'Six times seven?',p_answer:'42',p_points:20,p_status:'published',p_case_sensitive:false})).id);
  if(visual){const data=await admin('admin_arena'),config=structuredClone(data.config);config.enabled=true;config.opening_question_ids=[questions[0]];config.final_question_ids=[questions[1]];await admin('admin_save_arena',{p_config:config,p_expected_updated_at:data.updated_at});}
  await h.rpc('submit_answer',{p_puzzle_id:questions[0],p_answer:'42'},uid);if(visual)await h.rpc('arena_start',{p_level:2},uid);
  const sql=await readFile('supabase/reset-student-registrations.sql','utf8');
  // The SQL editor can submit this as a single statement, with no session-local table.
  await h.owner(()=>h.db.query(sql));
  for(const table of['public.profiles','auth.users'])assert.deepEqual((await h.owner(()=>h.db.query('select id from '+table))).rows.map(row=>row.id),[h.admin]);
  assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from public.submissions'))).rows[0].n,0);
  assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from public.puzzles'))).rows[0].n,visual?5:2);
  assert.ok((await h.owner(()=>h.db.query('select count(*)::int n from public.admin_audit'))).rows[0].n>0);
  if(visual){assert.equal((await admin('admin_arena')).locked,false);assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from private.arena_attempts'))).rows[0].n,0);}
  await h.owner(()=>h.db.query(sql)); // Empty/repeated reset is harmless.
  const replacement=randomUUID();await h.owner(()=>h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[replacement,'reset@example.test',metadata]));
  assert.equal((await h.owner(()=>h.db.query("select count(*)::int n from public.profiles where role='student'"))).rows[0].n,1);
  await h.owner(()=>h.db.query("insert into public.puzzles(title,description,points,status,created_by) values('Owned content','Preserve this',10,'draft',$1)",[replacement]));
  await assert.rejects(h.owner(()=>h.db.query(sql)),/owns administrative records/);
  assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from auth.users'))).rows[0].n,2);
});
