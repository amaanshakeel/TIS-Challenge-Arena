import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {competitionHarness} from './helpers/competition-harness.mjs';

test('timed expiry finishes a level at zero points and unlocks the next level',async t=>{
  const h=await competitionHarness({visual:true,attemptLimit:true});t.after(()=>h.close());const uid=randomUUID(),other=randomUUID();
  await h.owner(async()=>{for(const [id,reg]of[[uid,'FINISH-1'],[other,'FINISH-2']]){await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,reg+'@example.test',JSON.stringify({full_name:'Progress Student',registration_number:reg,department:'Computing',semester:2})]);await h.db.query("update public.profiles set status='approved' where id=$1",[id]);}});
  const admin=(name,args={})=>h.rpc(name,args,h.admin),student=(name,args={},id=uid)=>h.rpc(name,args,id),questions=[];
  for(const title of['Opening progress','Final progress'])questions.push((await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:title,p_description:'Six times seven?',p_answer:'42',p_points:25,p_status:'published',p_case_sensitive:false})).id);
  const settings=await admin('admin_arena'),config=structuredClone(settings.config);config.enabled=true;config.opening_question_ids=[questions[0]];config.final_question_ids=[questions[1]];await admin('admin_save_arena',{p_config:config,p_expected_updated_at:settings.updated_at});
  await student('submit_answer',{p_puzzle_id:questions[0],p_answer:'42'});
  let logo=await student('arena_start',{p_level:2});for(let piece=0;piece<16;piece++)logo=await student('arena_move',{p_level:2,p_revision:logo.revision,p_move:{piece,slot:piece}});
  const robot=await student('arena_start',{p_level:3});await h.owner(()=>h.db.query("update private.arena_attempts set expires_at=clock_timestamp()-interval '1 second' where student_id=$1 and level=3",[uid]));
  const expired=await student('arena_start',{p_level:3});assert.equal(expired.status,'expired');assert.equal((await student('arena_progress')).levels[3].state,'locked');
  const sql=await readFile('supabase/timed-level-progression.sql','utf8');await h.owner(()=>h.db.exec(sql));
  await t.test('existing expired records immediately unlock the maze without receiving points',async()=>{
    const progress=await student('arena_progress');assert.equal(progress.levels[1].state,'completed');assert.equal(progress.levels[2].state,'expired');assert.equal(progress.levels[3].state,'current');assert.equal(progress.levels[4].state,'locked');
    assert.equal(progress.levels[1].can_play,false);assert.equal(progress.levels[2].can_play,false);assert.equal(progress.levels[3].can_play,true);assert.equal(progress.levels[2].finished,true);
    assert.equal((await student('student_overview')).points,125);assert.equal((await student('arena_start',{p_level:4})).status,'active');
    const repeated=await student('arena_start',{p_level:3});assert.equal(repeated.status,'expired');assert.equal(repeated.expires_at,expired.expires_at);
    assert.equal((await student('arena_move',{p_level:3,p_revision:robot.revision,p_move:{piece:0,slot:0}})).status,'expired');
  });
  await t.test('a passed deadline unlocks the next level even without reopening the expired challenge',async()=>{
    await h.owner(()=>h.db.query("update private.arena_attempts set expires_at=clock_timestamp()-interval '1 second' where student_id=$1 and level=4",[uid]));
    assert.equal((await student('submit_answer',{p_puzzle_id:questions[1],p_answer:'42'})).outcome,'correct');
    const progress=await student('arena_progress');assert.equal(progress.levels[3].state,'expired');assert.equal(progress.levels[4].state,'completed');assert.equal((await student('student_overview')).points,150);
  });
  await t.test('expiry never lets another student skip unresolved earlier levels',async()=>{
    await assert.rejects(student('arena_start',{p_level:4},other),/level_locked/);
    await assert.rejects(student('submit_answer',{p_puzzle_id:questions[1],p_answer:'42'},other),/level_locked/);
  });
  await t.test('rerunning the fix preserves completed scores and single attempts',async()=>{
    await h.owner(()=>h.db.exec(sql));assert.equal((await student('arena_start',{p_level:2})).started_at,logo.started_at);
    assert.equal((await student('student_overview')).points,150);
    const rows=await h.owner(()=>h.db.query('select count(*)::int n from private.arena_attempts where student_id=$1',[uid]));assert.equal(rows.rows[0].n,3);
  });
});
