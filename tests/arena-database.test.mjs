import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {competitionHarness} from './helpers/competition-harness.mjs';

test('five-level arena enforces gates, deadlines and atomic scoring',async t=>{
  const h=await competitionHarness({visual:true});t.after(()=>h.close());
  const uid=randomUUID(),other=randomUUID();
  await h.owner(async()=>{for(const [id,reg]of[[uid,'AR-1'],[other,'AR-2']]){
    await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,reg+'@example.test',JSON.stringify({full_name:'Arena Student',registration_number:reg,department:'Computing',semester:2})]);
    await h.db.query("update public.profiles set status='approved' where id=$1",[id]);
  }});
  const admin=(name,args={})=>h.rpc(name,args,h.admin),student=(name,args={},id=uid)=>h.rpc(name,args,id);
  const course=await admin('admin_arena');const config=structuredClone(course.config);
  const questions=[];
  for(const title of ['Opening question','Final question','Second opening question']){
    const q=await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:title,p_description:'What is six times seven?',p_answer:'42',p_points:20,p_status:'published',p_case_sensitive:false});questions.push(q.id);
  }
  config.opening_question_ids=[questions[0],questions[2]];config.final_question_ids=[questions[1]];config.enabled=true;
  let saved=await admin('admin_save_arena',{p_config:config,p_expected_updated_at:course.updated_at});
  await t.test('unavailable question submissions do not freeze an unstarted course',async()=>{
    await h.owner(()=>h.db.query("update public.puzzles set opens_at=clock_timestamp()+interval '1 hour' where id=$1",[questions[0]]));
    assert.equal((await student('submit_answer',{p_puzzle_id:questions[0],p_answer:'42'})).outcome,'puzzle_unavailable');
    assert.equal((await admin('admin_arena')).locked,false);
    await h.owner(()=>h.db.query('update public.puzzles set opens_at=null where id=$1',[questions[0]]));
  });
  await t.test('only admins configure; only approved students play; direct tables are private',async()=>{
    await assert.rejects(student('admin_arena'),/admin_required/);
    await assert.rejects(h.rpc('arena_progress',{},null),/permission denied/);
    await assert.rejects(h.asUser(uid,()=>h.db.query('select * from private.arena_attempts')),/permission denied/);
    await assert.rejects(h.rpc('arena_progress',{},h.admin),/student_not_eligible/);
  });
  await t.test('invalid settings reject atomically without changing the current course',async()=>{
    for(const change of[
      c=>{c.opening_question_ids=[];},c=>{c.final_question_ids=[questions[0]];},
      c=>{c.levels[1].settings.rows=0;},c=>{c.levels[1].settings.seconds=0;},
      c=>{c.levels[1].points=0;},c=>{c.levels[1].settings.image='https://example.test/other.jpg';},
      c=>{c.levels[1].opens_at='2026-10-16T00:00:00Z';c.levels[1].closes_at='2026-10-15T00:00:00Z';},
    ]){const invalid=structuredClone(saved.config);change(invalid);await assert.rejects(admin('admin_save_arena',{p_config:invalid,p_expected_updated_at:saved.updated_at}),/invalid_course/);}
    const invalidMaze=structuredClone(saved.config);invalidMaze.levels[3].settings.grid=['#.###','#...#','###.#','#...#','###.#'];
    await assert.rejects(admin('admin_save_arena',{p_config:invalidMaze,p_expected_updated_at:saved.updated_at}),/invalid_maze/);
    assert.equal((await admin('admin_arena')).updated_at,saved.updated_at);
  });
  await t.test('legacy answer endpoint cannot skip levels or solve a visual puzzle',async()=>{
    assert.equal((await student('arena_progress')).levels[0].state,'current');
    await assert.rejects(student('arena_start',{p_level:2}),/level_locked/);
    await assert.rejects(student('submit_answer',{p_puzzle_id:questions[1],p_answer:'42'}),/level_locked/);
    await assert.rejects(student('submit_answer',{p_puzzle_id:saved.config.levels[1].puzzle_id,p_answer:'completed'}),/visual_challenge_required/);
    assert.equal((await student('submit_answer',{p_puzzle_id:questions[0],p_answer:'42'})).outcome,'correct');
    assert.equal((await student('arena_progress')).levels[0].state,'current');
    await h.owner(()=>h.db.query("update public.puzzles set status='closed' where id=$1",[questions[2]]));
    await assert.rejects(student('arena_start',{p_level:2}),/level_locked/);
    assert.equal((await student('submit_answer',{p_puzzle_id:questions[2],p_answer:'42'})).outcome,'puzzle_unavailable');
    await h.owner(()=>h.db.query("update public.puzzles set status='published' where id=$1",[questions[2]]));
    assert.equal((await student('submit_answer',{p_puzzle_id:questions[2],p_answer:'42'})).outcome,'correct');
    const p=await student('arena_progress');assert.equal(p.levels[0].state,'completed');assert.equal(p.levels[1].state,'current');
  });
  let attempt;
  await t.test('starts once, resumes original deadline and freezes settings after participation',async()=>{
    attempt=await student('arena_start',{p_level:2});const resume=await student('arena_start',{p_level:2});
    assert.equal(resume.started_at,attempt.started_at);assert.equal(resume.expires_at,attempt.expires_at);
    assert.equal(attempt.state.board.length,16);assert.equal(new Set(attempt.state.tray).size,16);
    const changed=structuredClone(saved.config);changed.levels[1].settings.seconds=60;
    await assert.rejects(admin('admin_save_arena',{p_config:changed,p_expected_updated_at:saved.updated_at}),/course_locked/);
    await assert.rejects(student('arena_move',{p_level:2,p_revision:0,p_move:{piece:99,slot:0}}),/invalid_move/);
    const visual=await admin('admin_puzzle',{p_puzzle_id:saved.config.levels[1].puzzle_id});
    await assert.rejects(admin('admin_save_puzzle',{p_puzzle_id:visual.id,p_title:visual.title,p_description:visual.description,p_points:100,p_answer:'completed',p_status:'published',p_case_sensitive:false,p_expected_updated_at:visual.updated_at}),/visual_challenge_required/);
  });
  await t.test('moves persist and stale revisions reconcile rather than overwrite',async()=>{
    const first=await student('arena_move',{p_level:2,p_revision:0,p_move:{piece:0,slot:0}});
    assert.equal(first.revision,1);assert.equal(first.state.board[0],0);
    const stale=await student('arena_move',{p_level:2,p_revision:0,p_move:{piece:1,slot:1}});
    assert.equal(stale.outcome,'stale_move');assert.equal(stale.revision,1);assert.equal(stale.state.board[1],null);
    attempt=first;
    for(const move of[{piece:0,slot:1},{piece:1,slot:0},{piece:0,slot:0}])attempt=await student('arena_move',{p_level:2,p_revision:attempt.revision,p_move:move});
    assert.equal(attempt.state.board[0],0);assert.equal(attempt.state.board[1],1);
    assert.equal(new Set([...attempt.state.board.filter(piece=>piece!==null),...attempt.state.tray]).size,16);
  });
  await t.test('completion awards points once and unlocks the next level',async()=>{
    for(let piece=1;piece<16;piece++)attempt=await student('arena_move',{p_level:2,p_revision:attempt.revision,p_move:{piece,slot:piece}});
    assert.equal(attempt.status,'completed');assert.ok(attempt.awarded_points>0);
    const repeated=await student('arena_move',{p_level:2,p_revision:attempt.revision,p_move:{piece:0,slot:0}});
    assert.equal(repeated.status,'completed');
    assert.equal((await student('arena_progress')).levels[2].state,'current');
    const {rows}=await h.owner(()=>h.db.query('select count(*)::int n from public.submissions where student_id=$1 and puzzle_id=$2 and is_correct',[uid,saved.config.levels[1].puzzle_id]));assert.equal(rows[0].n,1);
  });
  await t.test('instructions and schedules remain editable without changing frozen scoring terms',async()=>{
    const content=structuredClone(saved.config);content.levels[2].description='Rebuild the friendly robot picture.';
    content.levels[2].opens_at=null;content.levels[2].closes_at=new Date(Date.now()+3600000).toISOString();
    saved=await admin('admin_save_arena',{p_config:content,p_expected_updated_at:saved.updated_at});
    const detail=await admin('admin_puzzle',{p_puzzle_id:content.levels[2].puzzle_id});assert.equal(detail.description,content.levels[2].description);assert.ok(detail.closes_at);
  });
  await t.test('robot attempt preserves landscape grid; expiry cannot reset or unlock maze',async()=>{
    const robot=await student('arena_start',{p_level:3});assert.equal(robot.settings.rows,4);assert.equal(robot.settings.cols,6);
    await h.owner(()=>h.db.query("update private.arena_attempts set expires_at=clock_timestamp()-interval '1 second' where student_id=$1 and level=3",[uid]));
    const expired=await student('arena_start',{p_level:3});assert.equal(expired.status,'expired');
    assert.equal((await student('arena_start',{p_level:3})).expires_at,expired.expires_at);
    await assert.rejects(student('arena_start',{p_level:4}),/level_locked/);
    assert.equal((await student('arena_progress')).levels[2].state,'expired');
  });
  await t.test('termination blocks existing attempts; disabling course stops all new actions',async()=>{
    await admin('admin_change_status',{p_student_id:uid,p_action:'terminate',p_expected_status:'approved'});
    await assert.rejects(student('arena_start',{p_level:2}),/student_not_eligible/);
    const disabled=structuredClone(saved.config);disabled.enabled=false;
    saved=await admin('admin_save_arena',{p_config:disabled,p_expected_updated_at:saved.updated_at});
    await assert.rejects(student('submit_answer',{p_puzzle_id:questions[0],p_answer:'42'},other),/course_unavailable/);
  });
});
