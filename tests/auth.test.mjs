import test from 'node:test';
import assert from 'node:assert/strict';

const valid = { full_name: '  Ayesha Khan ', email: ' AYESHA@example.com ', password: 'Strong pass 123', confirm_password: 'Strong pass 123', registration_number: ' CS-001 ', department: ' Computing ', semester: '2' };

test('registration normalizes identity fields without changing passwords', async () => {
  const { validateRegistration } = await import('../js/validation.js');
  const { errors, values } = validateRegistration(valid, [1,2,3,4,5,6,7,8]);
  assert.deepEqual(errors, {});
  assert.equal(values.email, 'ayesha@example.com');
  assert.equal(values.registration_number, 'CS-001');
  assert.equal(values.full_name, 'Ayesha Khan');
  assert.equal(values.password, valid.password);
});
test('invalid fields, confirmation and semesters are rejected', async () => {
  const { validateRegistration } = await import('../js/validation.js');
  const { errors } = validateRegistration({ ...valid, full_name: ' ', email: 'bad', password: 'short', confirm_password: 'wrong', registration_number: ' ', department: ' ', semester: '99' }, [1,2]);
  for (const field of ['full_name','email','password','confirm_password','registration_number','department','semester']) assert.ok(errors[field]);
});
test('routing fails closed for absent, unknown or unapproved profiles', async () => {
  const { destination } = await import('../js/access.js');
  assert.equal(destination(null), 'account.html');
  for (const status of ['pending','rejected','terminated','unknown']) assert.equal(destination({ role:'student',status }), 'account.html');
  assert.equal(destination({ role:'student',status:'approved' }), 'student.html');
  assert.equal(destination({ role:'admin',status:'approved' }), 'admin.html');
  assert.equal(destination({ role:'admin',status:'terminated' }), 'account.html');
  assert.equal(destination({ role:'superadmin',status:'approved' }), 'account.html');
});
test('signup only forwards student metadata, not role/status/score', async () => {
  const { createAuthService } = await import('../js/auth-service.js');
  let received;
  const client = { auth: { signUp: async args => { received = args; return { data:{user:{id:'u'},session:null},error:null }; } } };
  const service = createAuthService(client);
  await service.register({ ...valid, role:'admin',status:'approved',score:999 }, 'https://example.test/repo/account.html');
  assert.equal(received.options.emailRedirectTo, 'https://example.test/repo/account.html');
  assert.deepEqual(Object.keys(received.options.data).sort(), ['department','full_name','registration_number','semester']);
});
test('profile retrieval verifies the user and uses the authenticated ID', async () => {
  const { createAuthService } = await import('../js/auth-service.js');
  let queried;
  const profile = { id:'trusted',role:'student',status:'pending' };
  const client = { auth:{getUser: async () => ({data:{user:{id:'trusted'}},error:null})}, from: table => ({select: () => ({eq: (field,id) => { queried=[table,field,id]; return {maybeSingle: async () => ({data:profile,error:null})}; }})}) };
  const service = createAuthService(client);
  assert.deepEqual(await service.currentProfile(), profile);
  assert.deepEqual(queried, ['profiles','id','trusted']);
  profile.status='terminated';
  assert.equal((await service.currentProfile()).status,'terminated');
});
test('invalid sessions never query private data', async () => {
  const { createAuthService } = await import('../js/auth-service.js');
  const service = createAuthService({auth:{getUser: async () => ({data:{user:null},error:{code:'session_not_found'}})},from:()=>assert.fail('query should not run')});
  assert.equal(await service.currentProfile(),null);
});
test('network and query failures are not treated as valid profile data', async () => {
  const { createAuthService } = await import('../js/auth-service.js');
  const service = createAuthService({auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:'internal'}})})})})});
  await assert.rejects(service.currentProfile());
});
test('expected auth errors become safe messages', async () => {
  const { authErrorMessage } = await import('../js/validation.js');
  assert.match(authErrorMessage({code:'invalid_credentials'}), /email or password/i);
  assert.match(authErrorMessage({code:'email_not_confirmed'}), /confirm/i);
  assert.match(authErrorMessage({code:'user_already_exists'}), /sign in/i);
  assert.match(authErrorMessage({code:'over_request_rate_limit'}), /wait/i);
  assert.match(authErrorMessage({code:'over_email_send_rate_limit'}), /registration email service|email service/i);
  assert.doesNotMatch(authErrorMessage({code:'over_email_send_rate_limit'}), /requesting another email/i);
  assert.doesNotMatch(authErrorMessage({message:'secret SQL table profiles stack trace'}), /secret|SQL|stack/);
});
