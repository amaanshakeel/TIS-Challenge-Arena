-- DESTRUCTIVE: permanently delete all CURRENT student registrations, their
-- Auth accounts, submissions, scores and timed attempts. Preserve admins,
-- puzzle content, answers, course configuration and administrative audit history.
-- Run manually in the trusted Supabase SQL Editor, not from the website.
-- One atomic statement: no temporary table or cross-query session dependency.
do $reset$
declare
  student_ids uuid[];
begin
  select coalesce(array_agg(id),'{}'::uuid[]) into student_ids
  from (select id from public.profiles where role='student' order by id for update) selected;

  if exists(select 1 from public.puzzles where created_by=any(student_ids))
    or exists(select 1 from public.admin_audit where actor_id=any(student_ids))
  then raise exception 'A selected student owns administrative records. Reassign that ownership before resetting registrations.';end if;

  if to_regclass('private.arena_attempts') is not null then
    execute 'delete from private.arena_attempts where student_id=any($1)' using student_ids;
  end if;
  if to_regclass('private.arena_participants') is not null then
    execute 'delete from private.arena_participants where student_id=any($1)' using student_ids;
  end if;

  delete from public.submissions where student_id=any(student_ids);
  delete from public.profiles where id=any(student_ids);
  delete from auth.users where id=any(student_ids);

  raise notice 'Deleted % student registrations.',cardinality(student_ids);
end;
$reset$;
