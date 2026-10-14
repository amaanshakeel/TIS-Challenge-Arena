import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {competitionHarness} from './helpers/competition-harness.mjs';
import {inspectMaze} from '../js/arena-model.js';

test('two-attempt rule is enforced by the database and survives refresh',async t=>{
  const h=await competitionHarness({visual:true,attemptLimit:true});t.after(()=>h.close());const uid=randomUUID(),other=randomUUID();
  await h.owner(async()=>{for(const[id,reg]of[[uid,'LIMIT-1'],[other,'LIMIT-2']]){await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,reg+'@example.test',JSON.stringify({full_name:'Limit Student',registration_number:reg,department:'Computing',semester:2})]);await h.db.query("update public.profiles set status='approved' where id=$1",[id]);}});
  const admin=(name,args={})=>h.rpc(name,args,h.admin),student=(name,args={},id=uid)=>h.rpc(name,args,id);
  const ids=[];for(const title of['Two wrong','Correct on second','Opening limit','Final limit','Not available'])ids.push((await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:title,p_description:'Six times seven?',p_answer:'42',p_points:25,p_status:title==='Not available'?'draft':'published',p_case_sensitive:false})).id);
  const settings=await admin('admin_arena'),config=structuredClone(settings.config);config.enabled=true;config.opening_question_ids=[ids[2]];config.final_question_ids=[ids[3]];await admin('admin_save_arena',{p_config:config,p_expected_updated_at:settings.updated_at});
  await t.test('invalid and unavailable requests consume no attempts',async()=>{
    await assert.rejects(student('submit_answer',{p_puzzle_id:ids[0],p_answer:' '}),/invalid_answer/);
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[4],p_answer:'wrong'})).outcome,'puzzle_unavailable');
    assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from public.submissions'))).rows[0].n,0);
  });
  await t.test('second wrong answer closes the question at zero points; later correct answers cannot score',async()=>{
    const first=await student('submit_answer',{p_puzzle_id:ids[0],p_answer:'wrong'});assert.equal(first.outcome,'incorrect');assert.equal(first.attempts_remaining,1);
    const second=await student('submit_answer',{p_puzzle_id:ids[0],p_answer:'wrong again'});assert.equal(second.outcome,'attempts_exhausted');assert.equal(second.awarded_points,0);
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[0],p_answer:'42'})).outcome,'attempts_exhausted');
    const state=(await student('student_puzzles',{p_page:1,p_page_size:20})).rows.find(p=>p.id===ids[0]);assert.equal(state.exhausted,true);assert.equal(state.attempt_count,2);assert.equal(state.attempts_remaining,0);
    assert.equal((await student('question_status',{p_puzzle_id:ids[0]})).exhausted,true);
    await assert.rejects(h.rpc('question_status',{p_puzzle_id:ids[0]},null),/permission denied/);
    assert.equal((await student('student_overview')).points,0);
  });
  await t.test('a correct second answer earns full points once; other students keep their own attempts',async()=>{
    await student('submit_answer',{p_puzzle_id:ids[1],p_answer:'wrong'});
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[1],p_answer:'42'})).awarded_points,25);
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[1],p_answer:'42'})).outcome,'already_solved');
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[0],p_answer:'42'},other)).awarded_points,25);
  });
  await t.test('assigned questions expose remaining attempts and remain guarded by the level sequence',async()=>{
    await assert.rejects(student('question_status',{p_puzzle_id:ids[3]}),/level_locked/);
    await assert.rejects(student('submit_answer',{p_puzzle_id:ids[3],p_answer:'42'}),/level_locked/);
    await student('submit_answer',{p_puzzle_id:ids[2],p_answer:'wrong'});
    const progress=await student('arena_progress');assert.equal(progress.levels[0].questions[0].attempts_remaining,1);
    await student('submit_answer',{p_puzzle_id:ids[2],p_answer:'wrong again'});
    const updated=await student('arena_progress');assert.equal(updated.levels[0].questions[0].exhausted,true);
    assert.equal(updated.levels[0].state,'completed');assert.equal(updated.levels[1].state,'current');
    assert.equal((await student('arena_start',{p_level:2})).status,'active');
  });
  await t.test('reinstalling the update preserves the limit and existing awards',async()=>{
    const {readFile}=await import('node:fs/promises');const sql=await readFile('supabase/question-attempt-limit.sql','utf8');await h.owner(()=>h.db.exec(sql));
    assert.equal((await student('submit_answer',{p_puzzle_id:ids[0],p_answer:'42'})).outcome,'attempts_exhausted');
    assert.equal((await student('student_overview')).points,25);
  });
  await t.test('final questions also finish at zero points after two wrong answers',async()=>{
    for(const level of[2,3]){
      let attempt=await student('arena_start',{p_level:level});
      for(let piece=0;piece<attempt.state.board.length;piece++)attempt=await student('arena_move',{p_level:level,p_revision:attempt.revision,p_move:{piece,slot:piece}});
      assert.equal(attempt.status,'completed');
    }
    let maze=await student('arena_start',{p_level:4});const data=inspectMaze(maze.settings.grid),path=data.shortestPath;
    for(let i=1;i<path.length;i++){const delta=path[i]-path[i-1],direction=delta===1?'right':delta===-1?'left':delta===data.width?'down':'up';maze=await student('arena_move',{p_level:4,p_revision:maze.revision,p_move:{direction}});}
    const before=(await student('student_overview')).points;
    await student('submit_answer',{p_puzzle_id:ids[3],p_answer:'wrong'});await student('submit_answer',{p_puzzle_id:ids[3],p_answer:'wrong again'});
    const progress=await student('arena_progress');assert.ok(progress.levels.every(level=>level.state==='completed'));assert.equal(progress.levels[4].questions[0].exhausted,true);
    assert.equal((await student('student_overview')).points,before);
  });
  await t.test('previously awarded historical scores survive even if earlier policy allowed more guesses',async()=>{
    const legacy=await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:'Historical success',p_description:'Already awarded before the limit.',p_answer:'42',p_points:25,p_status:'published',p_case_sensitive:false});
    await h.owner(async()=>{for(let i=0;i<3;i++)await h.db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values($1,$2,'wrong',false,0)",[uid,legacy.id]);await h.db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values($1,$2,'42',true,25)",[uid,legacy.id]);});
    const before=(await student('student_overview')).points;assert.equal((await student('submit_answer',{p_puzzle_id:legacy.id,p_answer:'42'})).outcome,'already_solved');assert.equal((await student('student_overview')).points,before);
  });
});
