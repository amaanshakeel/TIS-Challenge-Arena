-- TIS Challenge Arena | Part 2 extension
-- Run once AFTER schema.sql, through the trusted Supabase SQL Editor.
-- No table write privileges are granted to browser clients.
begin;

create function private.require_admin() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  select id into actor from public.profiles
    where id=(select auth.uid()) and role='admin' and status='approved' for share;
  if actor is null then raise exception 'admin_required' using errcode='42501'; end if;
  return actor;
end;
$$;
revoke all on function private.require_admin() from public,anon,authenticated;

-- Clock timestamps distinguish closely spaced optimistic edits.
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end;
$$;
revoke all on function private.set_updated_at() from public,anon,authenticated;

create function private.admin_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'total_registrations',count(*),'pending',count(*) filter(where status='pending'),
    'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected'),
    'terminated',count(*) filter(where status='terminated')
  ) into result from public.profiles where role='student';
  return result || jsonb_build_object(
    'total_puzzles',(select count(*) from public.puzzles),
    'published_puzzles',(select count(*) from public.puzzles where status='published'),
    'total_attempts',(select count(*) from public.submissions),
    'successful_solves',(select count(*) from public.submissions where is_correct),
    'participating_students',(select count(distinct student_id) from public.submissions)
  );
end;
$$;

create function private.admin_participants(p_search text,p_status text,p_sort text,p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb; total bigint; search_text text:=lower(btrim(coalesce(p_search,'')));
begin
  perform private.require_admin();
  if char_length(search_text)>100 or p_status is null or p_status not in ('','pending','approved','rejected','terminated')
    or p_sort is null or p_sort not in ('newest','oldest','name','registration')
    or p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
  then raise exception 'invalid_input' using errcode='22023'; end if;
  select count(*) into total from public.profiles p where p.role='student'
    and (p_status='' or p.status=p_status)
    and (search_text='' or strpos(lower(concat_ws(' ',p.full_name,p.email,p.registration_number,p.department)),search_text)>0);
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select p.* from public.profiles p where p.role='student'
      and (p_status='' or p.status=p_status)
      and (search_text='' or strpos(lower(concat_ws(' ',p.full_name,p.email,p.registration_number,p.department)),search_text)>0)
    order by case when p_sort='newest' then p.created_at end desc,
      case when p_sort='oldest' then p.created_at end asc,
      case when p_sort='name' then lower(p.full_name) end asc,
      case when p_sort='registration' then lower(p.registration_number) end asc,p.id
    limit p_page_size offset (p_page-1)*p_page_size
  ) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function private.admin_change_status(p_student_id uuid,p_action text,p_expected_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.profiles; next_status text; previous text;
begin
  actor:=private.require_admin();
  if p_action is null or p_action not in ('approve','reject','terminate','restore') then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into target from public.profiles where id=p_student_id for update;
  if not found then raise exception 'record_not_found' using errcode='P0002'; end if;
  if target.role<>'student' then raise exception 'student_required' using errcode='22023'; end if;
  if target.status is distinct from p_expected_status then raise exception 'stale_record' using errcode='40001'; end if;
  previous:=target.status_before_termination;
  case p_action
    when 'approve' then
      if target.status not in ('pending','rejected') then raise exception 'invalid_transition' using errcode='22023'; end if;
      next_status:='approved'; previous:=null;
    when 'reject' then
      if target.status<>'pending' then raise exception 'invalid_transition' using errcode='22023'; end if;
      next_status:='rejected'; previous:=null;
    when 'terminate' then
      if target.status='terminated' then raise exception 'invalid_transition' using errcode='22023'; end if;
      next_status:='terminated'; previous:=target.status;
    when 'restore' then
      if target.status<>'terminated' then raise exception 'invalid_transition' using errcode='22023'; end if;
      if previous is null then raise exception 'restoration_unavailable' using errcode='22023'; end if;
      next_status:=previous;previous:=null;
  end case;
  update public.profiles set status=next_status,status_before_termination=previous where id=p_student_id;
  insert into public.admin_audit(actor_id,action,target_id,details)
    values(actor,'participant_'||p_action,p_student_id,jsonb_build_object('before',target.status,'after',next_status));
  return jsonb_build_object('id',p_student_id,'status',next_status);
end;
$$;

create function private.admin_puzzles(p_search text,p_status text,p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb; total bigint; search_text text:=lower(btrim(coalesce(p_search,'')));
begin
  perform private.require_admin();
  if char_length(search_text)>100 or p_status is null or p_status not in ('','draft','published','closed')
    or p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
  then raise exception 'invalid_input' using errcode='22023'; end if;
  select count(*) into total from public.puzzles p where (p_status='' or p.status=p_status)
    and (search_text='' or strpos(lower(p.title),search_text)>0);
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select p.*, (select count(*) from public.submissions s where s.puzzle_id=p.id) as attempts,
      (select count(*) from public.submissions s where s.puzzle_id=p.id and s.is_correct) as successful_solves,
      exists(select 1 from public.submissions s where s.puzzle_id=p.id) as scoring_locked
    from public.puzzles p where (p_status='' or p.status=p_status) and (search_text='' or strpos(lower(p.title),search_text)>0)
    order by p.created_at desc,p.id limit p_page_size offset (p_page-1)*p_page_size
  ) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function private.admin_puzzle(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.require_admin();
  select to_jsonb(p)||jsonb_build_object('correct_answer',a.correct_answer,'case_sensitive',a.case_sensitive,
    'scoring_locked',exists(select 1 from public.submissions s where s.puzzle_id=p.id)) into result
    from public.puzzles p left join public.puzzle_answers a on a.puzzle_id=p.id where p.id=p_puzzle_id;
  if result is null then raise exception 'record_not_found' using errcode='P0002'; end if;
  return result;
end;
$$;

create function private.admin_save_puzzle(
  p_puzzle_id uuid,p_title text,p_description text,p_answer text,p_points integer,p_difficulty text,p_status text,
  p_opens_at timestamptz,p_closes_at timestamptz,p_case_sensitive boolean,p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.puzzles; saved public.puzzles; old_answer public.puzzle_answers; answer_text text;
begin
  actor:=private.require_admin();
  if p_title is null or char_length(btrim(p_title)) not between 2 and 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 10000
    or p_points is null or p_points not between 1 and 10000
    or (p_difficulty is not null and p_difficulty not in ('easy','medium','hard'))
    or p_status is null or p_status not in ('draft','published','closed') or p_case_sensitive is null
    or (p_opens_at is not null and not isfinite(p_opens_at)) or (p_closes_at is not null and not isfinite(p_closes_at))
    or (p_opens_at is not null and p_closes_at is not null and p_opens_at>=p_closes_at)
  then raise exception 'invalid_input' using errcode='22023'; end if;
  answer_text:=case when p_answer is null then null else btrim(p_answer) end;
  if p_puzzle_id is null then
    if answer_text is null or char_length(answer_text) not between 1 and 500 then raise exception 'invalid_input' using errcode='22023'; end if;
    insert into public.puzzles(title,description,points,difficulty,status,opens_at,closes_at,created_by)
      values(btrim(p_title),btrim(p_description),p_points,p_difficulty,p_status,p_opens_at,p_closes_at,actor) returning * into saved;
    insert into public.puzzle_answers(puzzle_id,correct_answer,case_sensitive) values(saved.id,answer_text,p_case_sensitive);
  else
    select * into target from public.puzzles where id=p_puzzle_id for update;
    if not found then raise exception 'record_not_found' using errcode='P0002'; end if;
    if target.updated_at is distinct from p_expected_updated_at then raise exception 'stale_record' using errcode='40001'; end if;
    select * into old_answer from public.puzzle_answers where puzzle_id=p_puzzle_id;
    answer_text:=coalesce(answer_text,old_answer.correct_answer);
    if answer_text is null or char_length(answer_text) not between 1 and 500 then raise exception 'invalid_input' using errcode='22023'; end if;
    if exists(select 1 from public.submissions where puzzle_id=p_puzzle_id)
      and (p_points is distinct from target.points or answer_text is distinct from old_answer.correct_answer or p_case_sensitive is distinct from old_answer.case_sensitive)
    then raise exception 'scoring_locked' using errcode='55000'; end if;
    update public.puzzles set title=btrim(p_title),description=btrim(p_description),points=p_points,difficulty=p_difficulty,
      status=p_status,opens_at=p_opens_at,closes_at=p_closes_at where id=p_puzzle_id returning * into saved;
    insert into public.puzzle_answers(puzzle_id,correct_answer,case_sensitive) values(p_puzzle_id,answer_text,p_case_sensitive)
      on conflict(puzzle_id) do update set correct_answer=excluded.correct_answer,case_sensitive=excluded.case_sensitive;
  end if;
  insert into public.admin_audit(actor_id,action,target_id,details)
    values(actor,case when p_puzzle_id is null then 'puzzle_created' else 'puzzle_updated' end,saved.id,
      jsonb_build_object('status',saved.status,'points',saved.points));
  return to_jsonb(saved);
end;
$$;

create function private.admin_set_puzzle_status(p_puzzle_id uuid,p_status text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.puzzles; saved public.puzzles;
begin
  actor:=private.require_admin();
  if p_status is null or p_status not in ('draft','published','closed') then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into target from public.puzzles where id=p_puzzle_id for update;
  if not found then raise exception 'record_not_found' using errcode='P0002'; end if;
  if target.updated_at is distinct from p_expected_updated_at then raise exception 'stale_record' using errcode='40001'; end if;
  if p_status='published' and not exists(select 1 from public.puzzle_answers where puzzle_id=p_puzzle_id and char_length(btrim(correct_answer)) between 1 and 500)
    then raise exception 'answer_required' using errcode='22023'; end if;
  update public.puzzles set status=p_status where id=p_puzzle_id returning * into saved;
  insert into public.admin_audit(actor_id,action,target_id,details)
    values(actor,'puzzle_status_changed',p_puzzle_id,jsonb_build_object('before',target.status,'after',p_status));
  return to_jsonb(saved);
end;
$$;

-- SQL-standard bodies bind internal references at creation. No private-schema USAGE
-- is granted to clients; execution of only these authorized endpoints is permitted.
create function public.admin_overview() returns jsonb language sql security invoker
begin atomic select private.admin_overview(); end;
create function public.admin_participants(p_search text default '',p_status text default '',p_sort text default 'newest',p_page integer default 1,p_page_size integer default 20)
returns jsonb language sql security invoker
begin atomic select private.admin_participants(p_search,p_status,p_sort,p_page,p_page_size); end;
create function public.admin_change_status(p_student_id uuid,p_action text,p_expected_status text) returns jsonb language sql security invoker
begin atomic select private.admin_change_status(p_student_id,p_action,p_expected_status); end;
create function public.admin_puzzles(p_search text default '',p_status text default '',p_page integer default 1,p_page_size integer default 20) returns jsonb language sql security invoker
begin atomic select private.admin_puzzles(p_search,p_status,p_page,p_page_size); end;
create function public.admin_puzzle(p_puzzle_id uuid) returns jsonb language sql security invoker
begin atomic select private.admin_puzzle(p_puzzle_id); end;
create function public.admin_save_puzzle(p_puzzle_id uuid,p_title text,p_description text,p_answer text,p_points integer,p_difficulty text,p_status text,
  p_opens_at timestamptz,p_closes_at timestamptz,p_case_sensitive boolean,p_expected_updated_at timestamptz) returns jsonb language sql security invoker
begin atomic select private.admin_save_puzzle(p_puzzle_id,p_title,p_description,p_answer,p_points,p_difficulty,p_status,p_opens_at,p_closes_at,p_case_sensitive,p_expected_updated_at); end;
create function public.admin_set_puzzle_status(p_puzzle_id uuid,p_status text,p_expected_updated_at timestamptz) returns jsonb language sql security invoker
begin atomic select private.admin_set_puzzle_status(p_puzzle_id,p_status,p_expected_updated_at); end;

revoke all on function private.admin_overview(),private.admin_participants(text,text,text,integer,integer),private.admin_change_status(uuid,text,text),
  private.admin_puzzles(text,text,integer,integer),private.admin_puzzle(uuid),private.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz),
  private.admin_set_puzzle_status(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.admin_overview(),private.admin_participants(text,text,text,integer,integer),private.admin_change_status(uuid,text,text),
  private.admin_puzzles(text,text,integer,integer),private.admin_puzzle(uuid),private.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz),
  private.admin_set_puzzle_status(uuid,text,timestamptz) to authenticated;
revoke all on function public.admin_overview(),public.admin_participants(text,text,text,integer,integer),public.admin_change_status(uuid,text,text),
  public.admin_puzzles(text,text,integer,integer),public.admin_puzzle(uuid),public.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz),
  public.admin_set_puzzle_status(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_overview(),public.admin_participants(text,text,text,integer,integer),public.admin_change_status(uuid,text,text),
  public.admin_puzzles(text,text,integer,integer),public.admin_puzzle(uuid),public.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz),
  public.admin_set_puzzle_status(uuid,text,timestamptz) to authenticated;

notify pgrst,'reload schema';
commit;
