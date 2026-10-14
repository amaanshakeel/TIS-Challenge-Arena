-- TIS Challenge Arena | Part 3 extension
-- Run once AFTER schema.sql and part2.sql. Never reinstall the foundation.
begin;

create function private.require_student() returns uuid
language plpgsql security definer set search_path='' as $$
declare participant uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into participant from public.profiles where id=auth.uid() and role='student' and status='approved' for update;
  if participant is null then raise exception 'student_not_eligible' using errcode='42501'; end if;
  return participant;
end;
$$;
revoke all on function private.require_student() from public,anon,authenticated;

create function private.normalize_answer(value text) returns text
language sql immutable set search_path='' as $$
  select btrim(value,chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11));
$$;
revoke all on function private.normalize_answer(text) from public,anon,authenticated;

-- One canonical ranking calculation. It is private and never directly exposed.
create view private.competition_totals as
  select p.id,p.display_name,coalesce(sum(s.awarded_points) filter(where s.is_correct),0)::bigint as points,
    count(s.id) filter(where s.is_correct)::bigint as solved_count,max(s.submitted_at) filter(where s.is_correct) as last_solve
  from public.profiles p left join public.submissions s on s.student_id=p.id
  where p.role='student' and p.status='approved' group by p.id,p.display_name;
create view private.competition_ranks as
  select t.*,rank() over(order by t.points desc) as rank from private.competition_totals t;
revoke all on private.competition_totals,private.competition_ranks from public,anon,authenticated;

create function private.submit_answer(p_puzzle_id uuid,p_answer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; target public.puzzles; secret public.puzzle_answers; answer_text text;
  correct boolean; attempt_id uuid; recent_count bigint; first_recent timestamptz; at_time timestamptz;
begin
  participant:=private.require_student();
  answer_text:=private.normalize_answer(p_answer);
  if answer_text is null or char_length(answer_text) not between 1 and 500 then raise exception 'invalid_answer' using errcode='22023'; end if;
  select * into target from public.puzzles where id=p_puzzle_id for update;
  at_time:=clock_timestamp();
  if not found or target.status<>'published' or (target.opens_at is not null and target.opens_at>at_time)
    or (target.closes_at is not null and target.closes_at<=at_time)
  then return jsonb_build_object('outcome','puzzle_unavailable','awarded_points',0); end if;
  if exists(select 1 from public.submissions where student_id=participant and puzzle_id=p_puzzle_id and is_correct)
    then return jsonb_build_object('outcome','already_solved','awarded_points',0); end if;
  select count(*),min(submitted_at) into recent_count,first_recent from public.submissions
    where student_id=participant and submitted_at>at_time-interval '1 minute';
  if recent_count>=20 then
    return jsonb_build_object('outcome','rate_limited','awarded_points',0,
      'retry_after_seconds',greatest(1,ceil(extract(epoch from first_recent+interval '1 minute'-at_time))::integer));
  end if;
  select * into secret from public.puzzle_answers where puzzle_id=p_puzzle_id;
  if not found then return jsonb_build_object('outcome','puzzle_unavailable','awarded_points',0); end if;
  correct:=case when secret.case_sensitive then answer_text=private.normalize_answer(secret.correct_answer)
    else lower(answer_text)=lower(private.normalize_answer(secret.correct_answer)) end;
  insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points,submitted_at)
    values(participant,p_puzzle_id,answer_text,correct,case when correct then target.points else 0 end,at_time)
    on conflict(student_id,puzzle_id) where is_correct do nothing returning id into attempt_id;
  if attempt_id is null then return jsonb_build_object('outcome','already_solved','awarded_points',0); end if;
  return jsonb_build_object('outcome',case when correct then 'correct' else 'incorrect' end,'awarded_points',case when correct then target.points else 0 end);
end;
$$;

create function private.student_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; result jsonb;
begin
  participant:=private.require_student();
  select jsonb_build_object('points',r.points,'rank',r.rank,'solved_count',r.solved_count) into result
    from private.competition_ranks r where r.id=participant;
  return result || jsonb_build_object('available_puzzles',(select count(*) from public.puzzles where status='published'
    and (opens_at is null or opens_at<=clock_timestamp()) and (closes_at is null or closes_at>clock_timestamp())));
end;
$$;

create function private.student_puzzles(p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; results jsonb; total bigint; at_time timestamptz;
begin
  participant:=private.require_student();at_time:=clock_timestamp();
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
    then raise exception 'invalid_input' using errcode='22023'; end if;
  select count(*) into total from public.puzzles where status='published' and (opens_at is null or opens_at<=at_time) and (closes_at is null or closes_at>at_time);
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select p.id,p.title,p.description,p.points,p.difficulty,p.status,p.opens_at,p.closes_at,
      exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct) as solved,
      (select count(*) from public.submissions s where s.student_id=participant and s.puzzle_id=p.id) as attempt_count
    from public.puzzles p where p.status='published' and (p.opens_at is null or p.opens_at<=at_time) and (p.closes_at is null or p.closes_at>at_time)
    order by p.created_at,p.id limit p_page_size offset(p_page-1)*p_page_size
  ) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function private.public_leaderboard(p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb; total bigint;
begin
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
    then raise exception 'invalid_input' using errcode='22023'; end if;
  select count(*) into total from private.competition_ranks;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select rank,display_name,points,solved_count from private.competition_ranks
    order by points desc,lower(display_name),id limit p_page_size offset(p_page-1)*p_page_size
  ) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function private.admin_rankings(p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb; total bigint;
begin
  perform private.require_admin();
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
    then raise exception 'invalid_input' using errcode='22023'; end if;
  select count(*) into total from private.competition_ranks;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select r.rank,r.display_name,r.points,r.solved_count,r.last_solve,p.registration_number,p.department,p.semester
    from private.competition_ranks r join public.profiles p on p.id=r.id
    order by r.points desc,lower(r.display_name),r.id limit p_page_size offset(p_page-1)*p_page_size
  ) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function public.submit_answer(p_puzzle_id uuid,p_answer text) returns jsonb language sql security invoker
begin atomic select private.submit_answer(p_puzzle_id,p_answer); end;
create function public.student_overview() returns jsonb language sql security invoker
begin atomic select private.student_overview(); end;
create function public.student_puzzles(p_page integer default 1,p_page_size integer default 20) returns jsonb language sql security invoker
begin atomic select private.student_puzzles(p_page,p_page_size); end;
create function public.public_leaderboard(p_page integer default 1,p_page_size integer default 20) returns jsonb language sql security invoker
begin atomic select private.public_leaderboard(p_page,p_page_size); end;
create function public.admin_rankings(p_page integer default 1,p_page_size integer default 20) returns jsonb language sql security invoker
begin atomic select private.admin_rankings(p_page,p_page_size); end;

revoke all on function private.submit_answer(uuid,text),private.student_overview(),private.student_puzzles(integer,integer),
  private.public_leaderboard(integer,integer),private.admin_rankings(integer,integer) from public,anon,authenticated;
revoke all on function public.submit_answer(uuid,text),public.student_overview(),public.student_puzzles(integer,integer),
  public.public_leaderboard(integer,integer),public.admin_rankings(integer,integer) from public,anon,authenticated;
grant execute on function private.submit_answer(uuid,text),private.student_overview(),private.student_puzzles(integer,integer),private.admin_rankings(integer,integer),
  public.submit_answer(uuid,text),public.student_overview(),public.student_puzzles(integer,integer),public.admin_rankings(integer,integer) to authenticated;
grant execute on function private.public_leaderboard(integer,integer),public.public_leaderboard(integer,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
