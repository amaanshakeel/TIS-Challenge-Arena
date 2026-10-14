-- Run AFTER visual-puzzles.sql. This update is safe to rerun.
-- Questions allow two valid submitted answers per student. Two incorrect answers
-- permanently close that question at zero points. Existing awards are preserved.
begin;

do $$ begin
  if to_regclass('private.arena_course') is null then
    raise exception 'Install visual-puzzles.sql before question-attempt-limit.sql';
  end if;
end; $$;

create or replace function private.question_attempt_state(participant uuid,puzzle uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('attempt_limit',2,'attempt_count',count(*),
    'attempts_remaining',case when coalesce(bool_or(is_correct),false) then 0 else greatest(0,2-count(*) filter(where not is_correct)) end,
    'exhausted',not coalesce(bool_or(is_correct),false) and count(*) filter(where not is_correct)>=2)
  from public.submissions where student_id=participant and puzzle_id=puzzle;
$$;
revoke all on function private.question_attempt_state(uuid,uuid) from public,anon,authenticated;

create or replace function private.submit_answer(p_puzzle_id uuid,p_answer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; target public.puzzles; result jsonb; state jsonb;
begin
  participant:=private.require_student();
  -- Same profile -> course -> puzzle ordering as visual and admin operations.
  perform 1 from private.arena_course where singleton for share;
  select * into target from public.puzzles where id=p_puzzle_id for update;
  if target.arena_level is not null then
    if target.arena_level not in (1,5) then raise exception 'visual_challenge_required' using errcode='55000';end if;
    perform private.arena_check_gate(participant,target.arena_level);
  end if;
  state:=private.question_attempt_state(participant,p_puzzle_id);
  if (state->>'exhausted')::boolean then
    return jsonb_build_object('outcome','attempts_exhausted','awarded_points',0)||state;
  end if;
  -- The existing checker validates answer text, availability, rate limits and
  -- trusted point awards. Requests rejected by it do not consume an attempt.
  result:=private.submit_answer_before_arena(p_puzzle_id,p_answer);
  if target.arena_level in (1,5) and result->>'outcome' in ('correct','incorrect','already_solved') then
    insert into private.arena_participants(student_id) values(participant) on conflict do nothing;
  end if;
  state:=private.question_attempt_state(participant,p_puzzle_id);
  if result->>'outcome'='incorrect' and (state->>'exhausted')::boolean then
    result:=result||jsonb_build_object('outcome','attempts_exhausted');
  end if;
  return result||state;
end;
$$;

-- A phase is finished once every assigned question is solved OR exhausted.
create or replace function private.arena_complete(participant uuid,level_number integer) returns boolean
language sql stable security definer set search_path='' as $$
  select case when level_number in (1,5) then
    exists(select 1 from public.puzzles where arena_level=level_number)
    and not exists(select 1 from public.puzzles p where arena_level=level_number
      and not exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct)
      and (select count(*) from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and not s.is_correct)<2)
  else exists(select 1 from private.arena_attempts where student_id=participant and level=level_number and status='completed') end;
$$;

-- Keep the deployed list/progress implementations and enrich their projections.
-- Conditional renames make reinstalling this update harmless.
do $$ begin
  if to_regprocedure('private.student_puzzles_before_attempt_limit(integer,integer)') is null then
    alter function private.student_puzzles(integer,integer) rename to student_puzzles_before_attempt_limit;
  end if;
  if to_regprocedure('private.arena_progress_before_attempt_limit()') is null then
    alter function private.arena_progress() rename to arena_progress_before_attempt_limit;
  end if;
end; $$;
revoke all on function private.student_puzzles_before_attempt_limit(integer,integer),private.arena_progress_before_attempt_limit() from public,anon,authenticated;

create or replace function private.student_puzzles(p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; result jsonb; rows jsonb;
begin
  participant:=private.require_student();result:=private.student_puzzles_before_attempt_limit(p_page,p_page_size);
  select coalesce(jsonb_agg(value||private.question_attempt_state(participant,(value->>'id')::uuid) order by ordinality),'[]'::jsonb)
    into rows from jsonb_array_elements(result->'rows') with ordinality;
  return jsonb_set(result,'{rows}',rows);
end;
$$;

create or replace function private.arena_progress() returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; result jsonb; levels jsonb:='[]'::jsonb; level jsonb; questions jsonb;
begin
  participant:=private.require_student();result:=private.arena_progress_before_attempt_limit();
  for level in select value from jsonb_array_elements(result->'levels') loop
    select coalesce(jsonb_agg(value||private.question_attempt_state(participant,(value->>'id')::uuid) order by ordinality),'[]'::jsonb)
      into questions from jsonb_array_elements(level->'questions') with ordinality;
    levels:=levels||jsonb_build_array(jsonb_set(level,'{questions}',questions));
  end loop;
  return jsonb_set(result,'{levels}',levels);
end;
$$;

-- Refresh the selected question before opening its answer dialog. This prevents
-- a stale browser tab from reopening a question exhausted in another tab.
create or replace function private.question_status(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; target public.puzzles; at_time timestamptz;
begin
  participant:=private.require_student();
  perform 1 from private.arena_course where singleton for share;
  select * into target from public.puzzles where id=p_puzzle_id for share;
  if not found then return jsonb_build_object('available',false);end if;
  if target.arena_level is not null then
    if target.arena_level not in (1,5) then raise exception 'visual_challenge_required' using errcode='55000';end if;
    perform private.arena_check_gate(participant,target.arena_level);
  end if;
  at_time:=clock_timestamp();
  return private.question_attempt_state(participant,p_puzzle_id)||jsonb_build_object(
    'available',target.status='published' and (target.opens_at is null or target.opens_at<=at_time) and (target.closes_at is null or target.closes_at>at_time),
    'solved',exists(select 1 from public.submissions where student_id=participant and puzzle_id=p_puzzle_id and is_correct));
end;
$$;
create or replace function public.question_status(p_puzzle_id uuid) returns jsonb language sql security invoker
begin atomic select private.question_status(p_puzzle_id);end;

-- Rebind SQL-standard wrappers after the private function renames.
create or replace function public.student_puzzles(p_page integer default 1,p_page_size integer default 20) returns jsonb language sql security invoker
begin atomic select private.student_puzzles(p_page,p_page_size);end;
create or replace function public.arena_progress() returns jsonb language sql security invoker
begin atomic select private.arena_progress();end;

revoke all on function private.submit_answer(uuid,text),private.student_puzzles(integer,integer),private.arena_progress(),private.arena_complete(uuid,integer),
  private.question_status(uuid),public.question_status(uuid),public.student_puzzles(integer,integer),public.arena_progress() from public,anon,authenticated;
grant execute on function private.submit_answer(uuid,text),private.student_puzzles(integer,integer),private.arena_progress(),
  private.question_status(uuid),public.question_status(uuid),public.student_puzzles(integer,integer),public.arena_progress() to authenticated;
notify pgrst,'reload schema';
commit;
