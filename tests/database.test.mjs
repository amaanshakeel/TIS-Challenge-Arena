import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const pending = '10000000-0000-0000-0000-000000000001';
const approved = '10000000-0000-0000-0000-000000000002';
const admin = '10000000-0000-0000-0000-000000000003';
const puzzle = '20000000-0000-0000-0000-000000000001';

test('foundation schema enforces permissions against real PostgreSQL roles', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  async function user(id, reg, meta = {}) {
    return db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [id,`${reg.trim()}@example.test`, JSON.stringify({full_name:'Test Student',registration_number:reg,department:'Computing',semester:2,...meta})]);
  }
  async function as(role,id,sql,params=[]) {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']);
      return await db.query(sql,params);
    } finally { await db.exec('reset role'); }
  }
  await t.test('signup ignores spoofed admin role and approved status', async () => {
    await user(pending,' CS-001 ',{role:'admin',status:'approved'});
    const {rows} = await db.query('select role,status,registration_number from public.profiles where id=$1',[pending]);
    assert.deepEqual(rows[0],{role:'student',status:'pending',registration_number:'CS-001'});
  });
  await t.test('duplicate registration numbers are blocked after trim/case normalization', async () => {
    await assert.rejects(user(approved,'cs-001'), /duplicate key/);
    const {rows} = await db.query('select id from auth.users where id=$1',[approved]);
    assert.equal(rows.length,0);
  });
  await t.test('invalid metadata is rejected by trusted registration trigger', async () => {
    await assert.rejects(user(approved,'CS-002',{semester:99}), /invalid_registration/);
    await assert.rejects(user(approved,'CS-002',{full_name:' '}), /invalid_registration/);
    await user(approved,'CS-002');
    await user(admin,'CS-003');
    await db.query("update public.profiles set status='approved' where id=$1",[approved]);
    await db.query("update public.profiles set role='admin',status='approved' where id=$1",[admin]);
  });
  await t.test('anonymous callers cannot read profiles or answers', async () => {
    await assert.rejects(as('anon',null,'select * from public.profiles'), /permission denied/);
    await assert.rejects(as('anon',null,'select * from public.puzzle_answers'), /permission denied/);
  });
  await t.test('students can read only their own private profile', async () => {
    const {rows} = await as('authenticated',pending,'select id from public.profiles');
    assert.deepEqual(rows.map(x=>x.id),[pending]);
  });
  await t.test('students cannot self-approve, promote roles, insert profiles, or score', async () => {
    for (const sql of ["update public.profiles set role='admin'", "update public.profiles set status='approved'", 'insert into public.profiles(id) values (gen_random_uuid())', 'insert into public.submissions(id) values (gen_random_uuid())']) {
      await assert.rejects(as('authenticated',pending,sql), /permission denied/);
    }
    await assert.rejects(as('authenticated',pending,"select private.handle_new_user()"), /permission denied/);
  });
  await t.test('changing editable Auth metadata does not change stored role or status', async () => {
    await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data || '{\"role\":\"admin\",\"status\":\"approved\"}'::jsonb where id=$1",[pending]);
    const {rows} = await as('authenticated',pending,'select role,status from public.profiles');
    assert.deepEqual(rows[0],{role:'student',status:'pending'});
  });
  await t.test('verified admins can read participant records without recursive RLS', async () => {
    const {rows} = await as('authenticated',admin,'select id from public.profiles');
    assert.equal(rows.length,3);
  });
  await db.query("insert into public.puzzles(id,title,description,points,status,created_by) values ($1,'Published puzzle','Description',10,'published',$2)",[puzzle,admin]);
  await db.query("insert into public.puzzle_answers(puzzle_id,correct_answer) values ($1,'secret answer')",[puzzle]);
  await db.query("insert into public.puzzles(title,description,points,status,created_by) values ('Draft puzzle','Description',10,'draft',$1), ('Closed puzzle','Description',10,'closed',$1)",[admin]);
  await t.test('pending/rejected/terminated students cannot read puzzles', async () => {
    for (const status of ['pending','rejected','terminated']) {
      await db.query('update public.profiles set status=$1 where id=$2',[status,pending]);
      assert.equal((await as('authenticated',pending,'select id from public.puzzles')).rows.length,0);
    }
  });
  await t.test('approved students see only available published puzzles and no answers', async () => {
    assert.deepEqual((await as('authenticated',approved,'select id from public.puzzles')).rows.map(x=>x.id),[puzzle]);
    assert.equal((await as('authenticated',approved,'select * from public.puzzle_answers')).rows.length,0);
    await assert.rejects(as('authenticated',approved,"update public.puzzles set points=999"),/permission denied/);
    await assert.rejects(as('authenticated',approved,"select private.is_admin()"),/permission denied/);
  });
  await t.test('termination takes effect immediately for an existing authenticated role', async () => {
    await db.query("update public.profiles set status='terminated' where id=$1",[approved]);
    assert.equal((await as('authenticated',approved,'select * from public.puzzles')).rows.length,0);
    await db.query("update public.profiles set status='approved' where id=$1",[approved]);
  });
  await t.test('future and expired publication windows are excluded', async () => {
    await db.query("update public.puzzles set opens_at=now()+interval '1 hour' where id=$1",[puzzle]);
    assert.equal((await as('authenticated',approved,'select id from public.puzzles')).rows.length,0);
    await db.query("update public.puzzles set opens_at=null,closes_at=now()-interval '1 hour' where id=$1",[puzzle]);
    assert.equal((await as('authenticated',approved,'select id from public.puzzles')).rows.length,0);
    await db.query('update public.puzzles set closes_at=null where id=$1',[puzzle]);
  });
  await t.test('email mirror follows authoritative Auth email', async () => {
    await db.query('update auth.users set email=$1 where id=$2',['NEW@example.test',pending]);
    assert.equal((await as('authenticated',pending,'select email from public.profiles')).rows[0].email,'new@example.test');
  });
  await t.test('students cannot view another participant submission history', async () => {
    await db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values ($1,$2,'answer',true,10)",[approved,puzzle]);
    assert.equal((await as('authenticated',pending,'select * from public.submissions')).rows.length,0);
    assert.equal((await as('authenticated',approved,'select * from public.submissions')).rows.length,1);
  });
  await t.test('successful solve uniqueness and points snapshot protect future scoring', async () => {
    await assert.rejects(db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values ($1,$2,'answer',true,10)",[approved,puzzle]),/duplicate key/);
    await assert.rejects(db.query('update public.puzzles set points=20 where id=$1',[puzzle]), /scoring_locked/);
    await assert.rejects(db.query("update public.puzzle_answers set correct_answer='changed' where puzzle_id=$1",[puzzle]),/scoring_locked/);
    await assert.rejects(db.query("insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points) values ($1,$2,'wrong',false,10)",[approved,puzzle]),/check constraint/);
  });
  await t.test('admin role without approved status loses privileged reads', async () => {
    await db.query("update public.profiles set status='terminated' where id=$1",[admin]);
    assert.equal((await as('authenticated',admin,'select id from public.profiles')).rows.length,1);
    assert.equal((await as('authenticated',admin,'select * from public.puzzle_answers')).rows.length,0);
  });
  await t.test('provisioning refuses placeholders and incorrect identity, then promotes the verified account', async () => {
    const source=await readFile(new URL('../supabase/provision-admin.sql',import.meta.url),'utf8');
    await assert.rejects(db.exec(source),/Replace the admin UUID/);
    await db.exec('rollback');
    // Replace only declaration values, keeping the placeholder guard literals intact.
    const prepared=source.replace("intended_id uuid := '00000000-0000-0000-0000-000000000000'",`intended_id uuid := '${admin}'`).replace("intended_email text := 'REPLACE_WITH_VERIFIED_ADMIN_EMAIL'","intended_email text := 'CS-003@example.test'");
    await assert.rejects(db.exec(prepared.replace("intended_email text := 'CS-003@example.test'","intended_email text := 'wrong@example.test'")),/No matching Auth user/);
    await db.exec('rollback');
    await db.exec(prepared);
    assert.equal((await as('authenticated',admin,'select id from public.profiles')).rows.length,3);
    assert.equal((await as('authenticated',admin,"select action from public.admin_audit where action='initial_admin_provisioning'")).rows.length,1);
    assert.equal((await as('authenticated',pending,'select * from public.admin_audit')).rows.length,0);
  });
});
