import test from 'node:test';
import assert from 'node:assert/strict';
test('answers trim only outer ASCII whitespace and preserve meaningful inner text',async()=>{
  const {validateAnswer}=await import('../js/competition-validation.js');
  assert.deepEqual(validateAnswer('\t Forty  Two\n'),{value:'Forty  Two',error:null});
  assert.ok(validateAnswer(' ').error);assert.ok(validateAnswer('x'.repeat(501)).error);
});
test('submission feedback covers correct/incorrect/repeated/unavailable/rate-limited outcomes safely',async()=>{
  const {submissionFeedback}=await import('../js/competition-validation.js');
  assert.match(submissionFeedback({outcome:'correct',awarded_points:25}).message,/25/);
  assert.match(submissionFeedback({outcome:'incorrect'}).message,/try again/i);
  assert.match(submissionFeedback({outcome:'already_solved'}).message,/already solved/i);
  assert.match(submissionFeedback({outcome:'puzzle_unavailable'}).message,/closed|available/i);
  assert.match(submissionFeedback({outcome:'rate_limited',retry_after_seconds:30}).message,/30/);
  assert.doesNotMatch(submissionFeedback({outcome:'unknown',correct_answer:'secret'}).message,/secret/);
});
test('competition errors explain ineligibility, session expiry and missing setup without raw internals',async()=>{
  const {competitionErrorMessage}=await import('../js/competition-validation.js');
  assert.match(competitionErrorMessage({message:'student_not_eligible'}),/eligible|access/i);
  assert.match(competitionErrorMessage({message:'authentication_required'}),/sign in/i);
  assert.match(competitionErrorMessage({code:'PGRST202'}),/setup|SQL/i);
  assert.doesNotMatch(competitionErrorMessage({message:'SQL secret stack trace'}),/secret|stack/);
});
test('competition service sends only puzzle ID and answer for scoring, preserves trusted responses',async()=>{
  const {createCompetitionService}=await import('../js/competition-service.js');
  const calls=[];const result={outcome:'correct',awarded_points:25};const service=createCompetitionService({rpc:async(name,args)=>{calls.push([name,args]);return {data:result,error:null};}});
  assert.deepEqual(await service.submitAnswer('p','answer'),result);
  assert.deepEqual(calls[0],['submit_answer',{p_puzzle_id:'p',p_answer:'answer'}]);
  await service.leaderboard({page:2,pageSize:5});assert.deepEqual(calls[1],['public_leaderboard',{p_page:2,p_page_size:5}]);
});
test('read failures are surfaced, never replaced with fake scores',async()=>{
  const {createCompetitionService}=await import('../js/competition-service.js');
  await assert.rejects(createCompetitionService({rpc:async()=>({data:null,error:{code:'PGRST202'}})}).overview());
});
