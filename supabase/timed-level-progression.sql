-- Run AFTER visual-puzzles.sql and question-attempt-limit.sql.
-- Safe to rerun. Preserve all attempts, deadlines and awarded scores.
begin;
do $$ begin
  if to_regprocedure('private.arena_progress_before_attempt_limit()') is null then
    raise exception 'Install visual-puzzles.sql and question-attempt-limit.sql before this fix';
  end if;
end; $$;

-- "Complete" here means finished for progression. Expiry gives no success
-- submission or points; it only satisfies the preceding-level gate.
create or replace function private.arena_complete(participant uuid,level_number integer) returns boolean
language sql volatile security definer set search_path='' as $$
  select case when level_number in (1,5) then
    exists(select 1 from public.puzzles where arena_level=level_number)
    and not exists(select 1 from public.puzzles p where arena_level=level_number
      and not exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct)
      and (select count(*) from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and not s.is_correct)<2)
  else exists(select 1 from private.arena_attempts where student_id=participant and level=level_number
    and (status in ('completed','expired') or (status='active' and expires_at<=clock_timestamp()))) end;
$$;

-- Update the underlying projection, retaining the outer question-limit wrapper.
-- Expired levels retain their Expired label even though the next gate is open.
create or replace function private.arena_progress_before_attempt_limit() returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; course jsonb; result jsonb:='[]'::jsonb; n integer; config jsonb; status_text text;
  previous_finished boolean:=true; finished boolean; questions jsonb; available boolean; at_time timestamptz;
begin
  participant:=private.require_student();select c.config into course from private.arena_course c where singleton for share;
  if course is null then return jsonb_build_object('enabled',false,'levels','[]'::jsonb);end if;
  at_time:=clock_timestamp();
  update private.arena_attempts set status='expired',finished_at=at_time
    where student_id=participant and status='active' and expires_at<=at_time;
  for n in 1..5 loop
    config:=course->'levels'->(n-1);
    -- One progress snapshot: do not label an active attempt Completed if its
    -- deadline passes between the expiry update and the level projection.
    finished:=case when n in (2,3,4) then exists(select 1 from private.arena_attempts
      where student_id=participant and level=n and status in ('completed','expired'))
      else private.arena_complete(participant,n) end;
    status_text:=case when not previous_finished then 'locked'
      when exists(select 1 from private.arena_attempts where student_id=participant and level=n and status='expired') then 'expired'
      when finished then 'completed' else 'current' end;
    questions:='[]'::jsonb;available:=true;
    if n in (2,3,4) then
      select status='published' and (opens_at is null or opens_at<=at_time) and (closes_at is null or closes_at>at_time)
        into available from public.puzzles where id=(config->>'puzzle_id')::uuid;
    end if;
    if n in (1,5) and status_text in ('current','completed') then
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into questions from (
        select p.id,p.title,p.description,p.points,p.difficulty,p.created_at,
          p.status='published' and (p.opens_at is null or p.opens_at<=at_time) and (p.closes_at is null or p.closes_at>at_time) as available,
          exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct) as solved
        from public.puzzles p where p.arena_level=n) q;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('id',n,'title',config->>'title','kind',config->>'kind','state',status_text,
      'finished',finished,'questions',questions,'settings',case when status_text='locked' then null else config->'settings' end,'points',config->'points',
      'description',case when status_text='locked' then null else config->>'description' end,'opens_at',config->'opens_at','closes_at',config->'closes_at',
      'available',coalesce(available,false),'can_play',(course->>'enabled')::boolean and status_text='current' and coalesce(available,false)));
    previous_finished:=previous_finished and finished;
  end loop;
  return jsonb_build_object('enabled',course->'enabled','levels',result,'server_time',clock_timestamp());
end;
$$;
revoke all on function private.arena_complete(uuid,integer),private.arena_progress_before_attempt_limit() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
