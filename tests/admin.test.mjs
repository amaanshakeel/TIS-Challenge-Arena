import test from 'node:test';
import assert from 'node:assert/strict';

const draft={title:' Logic ',description:' Solve this. ',correct_answer:' 42 ',points:'20',difficulty:'easy',status:'draft',opens_at:'',closes_at:'',case_sensitive:false};
test('puzzle validation normalizes text and optional fields',async()=>{
  const {validatePuzzle}=await import('../js/admin-validation.js');
  const {values,errors}=validatePuzzle(draft);
  assert.deepEqual(errors,{});assert.equal(values.title,'Logic');assert.equal(values.correct_answer,'42');assert.equal(values.points,20);assert.equal(values.opens_at,null);
});
test('puzzle validation rejects blank answers, fractional points, invalid dates and status',async()=>{
  const {validatePuzzle}=await import('../js/admin-validation.js');
  const {errors}=validatePuzzle({...draft,title:' ',description:' ',correct_answer:' ',points:'1.5',difficulty:'extreme',status:'bad',opens_at:'bad date'});
  for(const field of ['title','description','correct_answer','points','difficulty','status','opens_at'])assert.ok(errors[field]);
  assert.ok(validatePuzzle({...draft,opens_at:'2026-10-20T12:00',closes_at:'2026-10-19T12:00'}).errors.closes_at);
});
test('locked puzzles keep scoring fields and can update content',async()=>{
  const {validatePuzzle}=await import('../js/admin-validation.js');
  const original={id:'id',points:20,case_sensitive:true,scoring_locked:true};
  const {values,errors}=validatePuzzle({...draft,correct_answer:'',points:undefined,case_sensitive:undefined},original);
  assert.deepEqual(errors,{});assert.equal(values.correct_answer,null);assert.equal(values.points,20);assert.equal(values.case_sensitive,true);
});
test('database failures become safe actionable administrator messages',async()=>{
  const {adminErrorMessage}=await import('../js/admin-validation.js');
  assert.match(adminErrorMessage({message:'stale_record'}),/changed|refresh/i);
  assert.match(adminErrorMessage({message:'scoring_locked'}),/attempt|locked/i);
  assert.match(adminErrorMessage({message:'admin_required'}),/access|admin/i);
  assert.match(adminErrorMessage({code:'PGRST202'}),/SQL|setup/i);
  assert.match(adminErrorMessage({code:'PGRST301'}),/sign in|session/i);
  assert.doesNotMatch(adminErrorMessage({message:'secret SQL stack trace'}),/secret|stack/);
});
test('admin service sends bounded list arguments and expected versions',async()=>{
  const {createAdminService}=await import('../js/admin-service.js');
  const calls=[];const service=createAdminService({rpc:async(name,args)=>{calls.push([name,args]);return {data:{rows:[],total:0},error:null};}});
  await service.participants({search:'CS-001',status:'pending',sort:'name',page:2});
  assert.equal(calls[0][0],'admin_participants');assert.deepEqual(calls[0][1],{p_search:'CS-001',p_status:'pending',p_sort:'name',p_page:2,p_page_size:20});
  await service.changeStatus({id:'u',status:'pending'},'approve');
  assert.equal(calls[1][1].p_expected_status,'pending');
  await service.savePuzzle({title:'Logic',description:'Text',correct_answer:null,points:20,difficulty:null,status:'draft',opens_at:null,closes_at:null,case_sensitive:false},{id:'p',updated_at:'2026-10-14T12:00:00.123456+00:00'});
  assert.equal(calls[2][1].p_expected_updated_at,'2026-10-14T12:00:00.123456+00:00');assert.equal(calls[2][1].p_answer,null);
});
test('RPC errors reject instead of inventing successful data',async()=>{
  const {createAdminService}=await import('../js/admin-service.js');
  await assert.rejects(createAdminService({rpc:async()=>({data:null,error:{message:'admin_required'}})}).overview());
});
