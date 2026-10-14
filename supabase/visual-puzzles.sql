-- TIS Challenge Arena: five sequential levels.
-- Run ONCE after schema.sql, part2.sql and part3.sql. Existing scores are preserved.
begin;

alter table public.puzzles add column arena_level integer check(arena_level between 1 and 5);
create index puzzles_arena_level_idx on public.puzzles(arena_level) where arena_level is not null;
create table private.arena_course (
  singleton boolean primary key default true check(singleton),
  config jsonb not null, updated_at timestamptz not null default clock_timestamp()
);
create table private.arena_participants (
  student_id uuid primary key references public.profiles(id) on delete restrict,
  started_at timestamptz not null default clock_timestamp()
);
create table private.arena_attempts (
  student_id uuid not null references public.profiles(id) on delete restrict,
  level integer not null check(level between 2 and 4),
  puzzle_id uuid not null references public.puzzles(id) on delete restrict,
  started_at timestamptz not null, expires_at timestamptz not null,
  status text not null default 'active' check(status in ('active','completed','expired')),
  state jsonb not null, revision integer not null default 0 check(revision>=0),
  finished_at timestamptz, primary key(student_id,level)
);
create index arena_attempts_puzzle_idx on private.arena_attempts(puzzle_id);
alter table private.arena_course enable row level security;
alter table private.arena_participants enable row level security;
alter table private.arena_attempts enable row level security;
revoke all on private.arena_course,private.arena_participants,private.arena_attempts from public,anon,authenticated;

create function private.arena_complete(participant uuid,level_number integer) returns boolean
language sql stable security definer set search_path='' as $$
  select case when level_number in (1,5) then
    exists(select 1 from public.puzzles where arena_level=level_number)
    and not exists(select 1 from public.puzzles p where arena_level=level_number
      and not exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct))
  else exists(select 1 from private.arena_attempts where student_id=participant and level=level_number and status='completed') end;
$$;

create function private.arena_check_gate(participant uuid,level_number integer) returns void
language plpgsql security definer set search_path='' as $$
declare course jsonb; n integer;
begin
  select c.config into course from private.arena_course c where singleton for share;
  if course is null or not (course->>'enabled')::boolean then raise exception 'course_unavailable' using errcode='55000'; end if;
  for n in 1..level_number-1 loop
    if not private.arena_complete(participant,n) then raise exception 'level_locked' using errcode='55000'; end if;
  end loop;
end;
$$;

-- Wrap the existing answer implementation. Both old and new clients use this gate.
alter function private.submit_answer(uuid,text) rename to submit_answer_before_arena;
revoke all on function private.submit_answer_before_arena(uuid,text) from public,anon,authenticated;
create function private.submit_answer(p_puzzle_id uuid,p_answer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; level_number integer; course jsonb; result jsonb;
begin
  participant:=private.require_student();
  -- Lock course before puzzles, matching configuration/start/move lock order.
  select c.config into course from private.arena_course c where singleton for share;
  select arena_level into level_number from public.puzzles where id=p_puzzle_id;
  if level_number is not null then
    if level_number not in (1,5) then raise exception 'visual_challenge_required' using errcode='55000'; end if;
    perform private.arena_check_gate(participant,level_number);
  end if;
  result:=private.submit_answer_before_arena(p_puzzle_id,p_answer);
  if level_number in (1,5) and result->>'outcome' in ('correct','incorrect','already_solved') then
    insert into private.arena_participants(student_id) values(participant) on conflict do nothing;
  end if;
  return result;
end;
$$;
create or replace function public.submit_answer(p_puzzle_id uuid,p_answer text) returns jsonb language sql security invoker
begin atomic select private.submit_answer(p_puzzle_id,p_answer); end;

alter function private.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz) rename to admin_save_puzzle_before_arena;
revoke all on function private.admin_save_puzzle_before_arena(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz) from public,anon,authenticated;
create function private.admin_save_puzzle(p_puzzle_id uuid,p_title text,p_description text,p_answer text,p_points integer,p_difficulty text,p_status text,
  p_opens_at timestamptz,p_closes_at timestamptz,p_case_sensitive boolean,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  perform 1 from private.arena_course where singleton for share;
  if exists(select 1 from public.puzzles where id=p_puzzle_id and arena_level in (2,3,4))
    then raise exception 'visual_challenge_required' using errcode='55000';end if;
  return private.admin_save_puzzle_before_arena(p_puzzle_id,p_title,p_description,p_answer,p_points,p_difficulty,p_status,p_opens_at,p_closes_at,p_case_sensitive,p_expected_updated_at);
end;
$$;
create or replace function public.admin_save_puzzle(p_puzzle_id uuid,p_title text,p_description text,p_answer text,p_points integer,p_difficulty text,p_status text,
  p_opens_at timestamptz,p_closes_at timestamptz,p_case_sensitive boolean,p_expected_updated_at timestamptz) returns jsonb language sql security invoker
begin atomic select private.admin_save_puzzle(p_puzzle_id,p_title,p_description,p_answer,p_points,p_difficulty,p_status,p_opens_at,p_closes_at,p_case_sensitive,p_expected_updated_at);end;
revoke all on function private.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function private.admin_save_puzzle(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,boolean,timestamptz) to authenticated;

create function private.arena_lock_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare assigned integer; puzzle_key uuid;
begin
  if tg_table_name='puzzles' then
    if old.arena_level is distinct from new.arena_level and exists(select 1 from private.arena_participants)
      then raise exception 'course_locked' using errcode='55000'; end if;
    if (old.arena_level is not null or new.arena_level is not null) and old.points is distinct from new.points
      and exists(select 1 from private.arena_participants) then raise exception 'course_locked' using errcode='55000'; end if;
  else
    puzzle_key:=old.puzzle_id; select arena_level into assigned from public.puzzles where id=puzzle_key;
    if assigned is not null and exists(select 1 from private.arena_participants)
      and (old.correct_answer is distinct from new.correct_answer or old.case_sensitive is distinct from new.case_sensitive)
      then raise exception 'course_locked' using errcode='55000'; end if;
  end if;
  return new;
end;
$$;
create trigger arena_puzzle_terms before update of arena_level,points on public.puzzles for each row execute function private.arena_lock_terms();
create trigger arena_answer_terms before update of correct_answer,case_sensitive on public.puzzle_answers for each row execute function private.arena_lock_terms();

create function private.arena_maze_path(grid jsonb,blocked_a integer default -1,blocked_b integer default -1) returns integer[]
language plpgsql immutable set search_path='' as $$
declare h integer:=jsonb_array_length(grid);w integer:=length(grid->>0);finish integer:=(h-1)*w+w-2;
  parents integer[]:=array_fill(-1,array[h*w]);queue integer[]:=array[1];i integer:=1;cell integer;adjacent integer;nx integer;ny integer;x integer;y integer;path integer[]:='{}';
begin
  parents[2]:=-2;
  while i<=cardinality(queue) and parents[finish+1]=-1 loop
    cell:=queue[i];x:=cell%w;y:=cell/w;
    foreach adjacent in array array[cell-w,cell+1,cell+w,cell-1] loop
      nx:=adjacent%w;ny:=adjacent/w;
      if adjacent<0 or ny>=h or abs(nx-x)+abs(ny-y)<>1 or parents[adjacent+1]<>-1
        or (cell=blocked_a and adjacent=blocked_b) or (cell=blocked_b and adjacent=blocked_a) then continue;end if;
      if substr(grid->>ny,nx+1,1)='.' then parents[adjacent+1]:=cell;queue:=array_append(queue,adjacent);end if;
    end loop;i:=i+1;
  end loop;
  if parents[finish+1]=-1 then return path;end if;
  cell:=finish;
  while cell>=0 loop path:=array_prepend(cell,path);cell:=parents[cell+1];end loop;
  return path;
end;
$$;

create function private.arena_validate_maze(grid jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare h integer; w integer; y integer; x integer; i integer:=1; cell integer; adjacent integer; nx integer; ny integer;
  queue integer[]:=array[1]; seen integer[]:=array[1]; degree integer; edges integer:=0; dead_ends integer:=0; finish integer; row_text text;
  shortest integer[]; alternative integer[]; has_longer boolean:=false;
begin
  if jsonb_typeof(grid) is distinct from 'array' then raise exception 'invalid_maze' using errcode='22023'; end if;
  h:=jsonb_array_length(grid);w:=length(grid->>0);finish:=(h-1)*w+w-2;
  if h not between 5 and 41 or w not between 5 and 61 then raise exception 'invalid_maze' using errcode='22023'; end if;
  for y in 0..h-1 loop
    row_text:=grid->>y;
    if jsonb_typeof(grid->y)<>'string' or length(row_text)<>w or row_text !~ '^[#.]+$' then raise exception 'invalid_maze' using errcode='22023'; end if;
    for x in 0..w-1 loop
      if (y=0 or y=h-1 or x=0 or x=w-1) and substr(row_text,x+1,1)='.' and y*w+x not in (1,finish)
        then raise exception 'invalid_maze' using errcode='22023'; end if;
    end loop;
  end loop;
  if substr(grid->>0,2,1)<>'.' or substr(grid->>(h-1),w-1,1)<>'.' then raise exception 'invalid_maze' using errcode='22023'; end if;
  while i<=cardinality(queue) loop
    cell:=queue[i];x:=cell%w;y:=cell/w;degree:=0;
    foreach adjacent in array array[cell-w,cell+1,cell+w,cell-1] loop
      nx:=adjacent%w;ny:=adjacent/w;
      if adjacent<0 or ny>=h or abs(nx-x)+abs(ny-y)<>1 then continue; end if;
      if substr(grid->>ny,nx+1,1)='.' then
        degree:=degree+1;
        if not adjacent=any(seen) then seen:=array_append(seen,adjacent);queue:=array_append(queue,adjacent);end if;
      end if;
    end loop;
    edges:=edges+degree;
    if degree=1 and cell not in (1,finish) then dead_ends:=dead_ends+1;end if;
    i:=i+1;
  end loop;
  if not finish=any(seen) or dead_ends=0 or edges/2-cardinality(seen)+1<1 then raise exception 'invalid_maze' using errcode='22023'; end if;
  shortest:=private.arena_maze_path(grid);
  for i in 2..cardinality(shortest) loop
    alternative:=private.arena_maze_path(grid,shortest[i-1],shortest[i]);
    if cardinality(alternative)>cardinality(shortest) then has_longer:=true;exit;end if;
  end loop;
  if not has_longer then raise exception 'invalid_maze' using errcode='22023';end if;
end;
$$;

create function private.admin_arena() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; course private.arena_course; levels jsonb; puzzle uuid; n integer; questions jsonb;
begin
  actor:=private.require_admin();
  -- Serialize first-time setup, including simultaneous administrator requests.
  perform pg_advisory_xact_lock(724133,5);
  select * into course from private.arena_course where singleton;
  if not found then
    levels:='[{"id":1,"title":"Opening questions","kind":"questions"},{"id":2,"title":"Society logo jigsaw","kind":"jigsaw","points":100,"settings":{"image":"assets/puzzles/tis-logo.jpeg","rows":4,"cols":4,"seconds":180}},{"id":3,"title":"Robot workspace jigsaw","kind":"jigsaw","points":150,"settings":{"image":"assets/puzzles/robot-workspace.png","rows":4,"cols":6,"seconds":300}},{"id":4,"title":"Find the maze exit","kind":"maze","points":150,"settings":{"seconds":180,"grid":["#.#########################","#.......#.................#","#######.#.###############.#","#.....#.#.#.....#.........#","#.#.#.#.#.#.#.###.#######.#","#.#.#.#.#.#.#.#...#.......#","#.#.###.#.#.###.###.#.#####","#.#...#.#...#...#.#.......#","#.###.#.#.#.#.###.#######.#","#.#.#...#.#...#.......#...#","#.#.#####.#.###.#.#.###.###","#.....#.#.#.#...#.#.#...#.#","#####.#.#.#.#.#.#.###.###.#","#.#...#...#.#.........#...#","#.#.#.#####.#.#.#######.###","#.#.#...#.....#...#...#...#","#.#.#.#.#.###.###.#.#.###.#","#.........#.........#.....#","#########################.#"]}},{"id":5,"title":"Final questions","kind":"questions"}]'::jsonb;
    for n in 2..4 loop
      insert into public.puzzles(title,description,points,difficulty,status,created_by,arena_level)
        values(levels->(n-1)->>'title',case when n=4 then 'Reach the exit before time runs out. Walls cannot be crossed.' else 'Assemble the supplied image before time runs out.' end,
          (levels->(n-1)->>'points')::integer,'hard','draft',actor,n) returning id into puzzle;
      levels:=jsonb_set(levels,array[(n-1)::text],levels->(n-1)||jsonb_build_object('puzzle_id',puzzle,
        'description',case when n=4 then 'Reach the exit before time runs out. Walls cannot be crossed.' else 'Assemble the supplied image before time runs out.' end,
        'opens_at',null,'closes_at',null));
    end loop;
    insert into private.arena_course(config) values(jsonb_build_object('enabled',false,'opening_question_ids','[]'::jsonb,'final_question_ids','[]'::jsonb,'levels',levels)) returning * into course;
    insert into public.admin_audit(actor_id,action,target_id,details) values(actor,'arena_initialized',actor,'{}'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.title,q.id),'[]'::jsonb) into questions from
    (select p.id,p.title,p.status,p.points,p.arena_level,exists(select 1 from public.submissions s where s.puzzle_id=p.id) as attempted
      from public.puzzles p where arena_level is null or arena_level in (1,5)) q;
  return jsonb_build_object('config',course.config,'updated_at',course.updated_at,'locked',exists(select 1 from private.arena_participants),'questions',questions);
end;
$$;

create function private.arena_scoring_terms(config jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select (config-'enabled'-'levels')||jsonb_build_object('levels',
    (select jsonb_agg(value-'title'-'description'-'opens_at'-'closes_at' order by ordinality)
      from jsonb_array_elements(config->'levels') with ordinality));
$$;

create function private.admin_save_arena(p_config jsonb,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; course private.arena_course; n integer; level_config jsonb; settings jsonb; question_ids uuid[]; opening uuid[]; final_ids uuid[]; puzzle uuid; enabled boolean;
  opens timestamptz; closes timestamptz;
begin
  actor:=private.require_admin();select * into course from private.arena_course where singleton for update;
  if not found then raise exception 'course_not_initialized' using errcode='55000';end if;
  if course.updated_at is distinct from p_expected_updated_at then raise exception 'stale_record' using errcode='40001';end if;
  if p_config is null or jsonb_typeof(p_config->'enabled') is distinct from 'boolean' or jsonb_typeof(p_config->'levels') is distinct from 'array'
    or jsonb_array_length(p_config->'levels')<>5 or jsonb_typeof(p_config->'opening_question_ids') is distinct from 'array'
    or jsonb_typeof(p_config->'final_question_ids') is distinct from 'array' then raise exception 'invalid_course' using errcode='22023';end if;
  enabled:=(p_config->>'enabled')::boolean;
  if exists(select 1 from private.arena_participants) and private.arena_scoring_terms(p_config) is distinct from private.arena_scoring_terms(course.config)
    then raise exception 'course_locked' using errcode='55000';end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into opening from jsonb_array_elements_text(p_config->'opening_question_ids');
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into final_ids from jsonb_array_elements_text(p_config->'final_question_ids');
  question_ids:=opening||final_ids;
  if cardinality(question_ids)>100 or cardinality(question_ids)<>(select count(distinct q) from unnest(question_ids) q)
    or (enabled and (cardinality(opening)=0 or cardinality(final_ids)=0)) then raise exception 'invalid_course' using errcode='22023';end if;
  -- Lock all assigned/previously assigned puzzles in deterministic order.
  perform 1 from public.puzzles where id=any(question_ids) or arena_level is not null order by id for update;
  if exists(select 1 from unnest(question_ids) q left join public.puzzles p on p.id=q
      where p.id is null or p.arena_level in (2,3,4) or (enabled and p.status<>'published') or not exists(select 1 from public.puzzle_answers a where a.puzzle_id=q))
    then raise exception 'invalid_course' using errcode='22023';end if;
  if exists(select 1 from public.puzzles p join public.submissions s on s.puzzle_id=p.id where p.id=any(question_ids) and p.arena_level is null)
    then raise exception 'question_already_attempted' using errcode='55000';end if;
  for n in 1..5 loop
    level_config:=p_config->'levels'->(n-1);
    if (level_config->>'id')::integer is distinct from n or level_config->>'kind' is distinct from course.config->'levels'->(n-1)->>'kind'
      or length(level_config->>'title') not between 2 and 160 or level_config->>'title' is null
      then raise exception 'invalid_course' using errcode='22023';end if;
    if n in (2,3,4) then
      if level_config->>'puzzle_id' is distinct from course.config->'levels'->(n-1)->>'puzzle_id'
        or (level_config->>'points')::integer not between 1 and 10000 or level_config->>'points' is null
        then raise exception 'invalid_course' using errcode='22023';end if;
      settings:=level_config->'settings';
      if jsonb_typeof(level_config->'description') is distinct from 'string' or length(btrim(level_config->>'description')) not between 1 and 10000
        then raise exception 'invalid_course' using errcode='22023';end if;
      opens:=(level_config->>'opens_at')::timestamptz;closes:=(level_config->>'closes_at')::timestamptz;
      if (opens is not null and not isfinite(opens)) or (closes is not null and not isfinite(closes)) or (opens is not null and closes is not null and opens>=closes)
        then raise exception 'invalid_course' using errcode='22023';end if;
      if (settings->>'seconds')::integer not between 30 and 1800 or settings->>'seconds' is null then raise exception 'invalid_course' using errcode='22023';end if;
      if n in (2,3) then
        if settings->>'image' is distinct from course.config->'levels'->(n-1)->'settings'->>'image'
          or (settings->>'rows')::integer not between 3 and 8 or (settings->>'cols')::integer not between 3 and 8
          or settings->>'rows' is null or settings->>'cols' is null then raise exception 'invalid_course' using errcode='22023';end if;
      else perform private.arena_validate_maze(settings->'grid');end if;
      puzzle:=(level_config->>'puzzle_id')::uuid;
      update public.puzzles set title=level_config->>'title',description=btrim(level_config->>'description'),opens_at=opens,closes_at=closes,
        points=(level_config->>'points')::integer,status=case when enabled then 'published' else 'closed' end where id=puzzle;
    end if;
  end loop;
  update public.puzzles set arena_level=null where arena_level in (1,5) and not id=any(question_ids);
  update public.puzzles set arena_level=1 where id=any(opening) and arena_level is distinct from 1;
  update public.puzzles set arena_level=5 where id=any(final_ids) and arena_level is distinct from 5;
  update private.arena_course set config=p_config,updated_at=clock_timestamp() where singleton;
  insert into public.admin_audit(actor_id,action,target_id,details) values(actor,'arena_settings_updated',actor,jsonb_build_object('enabled',enabled));
  return private.admin_arena();
end;
$$;

create function private.arena_attempt_result(attempt private.arena_attempts,level_config jsonb,outcome text default 'ok') returns jsonb
language sql volatile set search_path='' as $$
 select jsonb_build_object('level',attempt.level,'status',attempt.status,'state',attempt.state,'revision',attempt.revision,
   'started_at',attempt.started_at,'expires_at',attempt.expires_at,'server_time',clock_timestamp(),'settings',level_config->'settings',
   'title',level_config->>'title','kind',level_config->>'kind','points',level_config->'points','outcome',outcome,
   'awarded_points',case when attempt.status='completed' then (level_config->>'points')::integer else 0 end);
$$;

create function private.arena_progress() returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; course jsonb; result jsonb:='[]'::jsonb; n integer; config jsonb; status_text text; previous_complete boolean:=true; complete boolean; questions jsonb; available boolean;
begin
  participant:=private.require_student();select c.config into course from private.arena_course c where singleton for share;
  if course is null then return jsonb_build_object('enabled',false,'levels','[]'::jsonb);end if;
  update private.arena_attempts set status='expired',finished_at=clock_timestamp() where student_id=participant and status='active' and expires_at<=clock_timestamp();
  for n in 1..5 loop
    config:=course->'levels'->(n-1);complete:=private.arena_complete(participant,n);
    status_text:=case when complete then 'completed' when not previous_complete then 'locked'
      when exists(select 1 from private.arena_attempts where student_id=participant and level=n and status='expired') then 'expired' else 'current' end;
    questions:='[]'::jsonb;
    available:=true;
    if n in (2,3,4) then
      select status='published' and (opens_at is null or opens_at<=clock_timestamp()) and (closes_at is null or closes_at>clock_timestamp())
        into available from public.puzzles where id=(config->>'puzzle_id')::uuid;
    end if;
    if n in (1,5) and status_text in ('current','completed') then
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into questions from (
        select p.id,p.title,p.description,p.points,p.difficulty,p.created_at,
          p.status='published' and (p.opens_at is null or p.opens_at<=clock_timestamp()) and (p.closes_at is null or p.closes_at>clock_timestamp()) as available,
          exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct) as solved
        from public.puzzles p where p.arena_level=n) q;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('id',n,'title',config->>'title','kind',config->>'kind','state',status_text,
      'questions',questions,'settings',case when status_text='locked' then null else config->'settings' end,'points',config->'points',
      'description',case when status_text='locked' then null else config->>'description' end,'opens_at',config->'opens_at','closes_at',config->'closes_at','available',coalesce(available,false)));
    previous_complete:=previous_complete and complete;
  end loop;
  return jsonb_build_object('enabled',course->'enabled','levels',result,'server_time',clock_timestamp());
end;
$$;

create function private.arena_start(p_level integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; course jsonb; config jsonb; target public.puzzles; attempt private.arena_attempts; now_time timestamptz; count_pieces integer; initial jsonb; tray jsonb;
begin
  participant:=private.require_student();
  if p_level is null or p_level not between 2 and 4 then raise exception 'invalid_input' using errcode='22023';end if;
  perform private.arena_check_gate(participant,p_level);
  select c.config into course from private.arena_course c where singleton;config:=course->'levels'->(p_level-1);
  select * into target from public.puzzles where id=(config->>'puzzle_id')::uuid for update;now_time:=clock_timestamp();
  if target.status<>'published' or (target.opens_at is not null and target.opens_at>now_time) or (target.closes_at is not null and target.closes_at<=now_time)
    then raise exception 'course_unavailable' using errcode='55000';end if;
  select * into attempt from private.arena_attempts where student_id=participant and level=p_level for update;
  if not found then
    if p_level in (2,3) then
      count_pieces:=(config->'settings'->>'rows')::integer*(config->'settings'->>'cols')::integer;
      select jsonb_agg(piece order by random()) into tray from generate_series(0,count_pieces-1) piece;
      select jsonb_build_object('board',jsonb_agg(null::integer),'tray',tray) into initial from generate_series(1,count_pieces);
    else initial:=jsonb_build_object('position',1,'visited',jsonb_build_array(1),'moves',0);end if;
    insert into private.arena_participants(student_id) values(participant) on conflict do nothing;
    insert into private.arena_attempts(student_id,level,puzzle_id,started_at,expires_at,state)
      values(participant,p_level,target.id,now_time,least(now_time+make_interval(secs=>(config->'settings'->>'seconds')::integer),coalesce(target.closes_at,'infinity'::timestamptz)),initial) returning * into attempt;
  end if;
  if attempt.status='active' and attempt.expires_at<=clock_timestamp() then
    update private.arena_attempts set status='expired',finished_at=clock_timestamp() where student_id=participant and level=p_level returning * into attempt;
  end if;
  return private.arena_attempt_result(attempt,config);
end;
$$;

create function private.arena_move(p_level integer,p_move jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; course jsonb; config jsonb; target public.puzzles; attempt private.arena_attempts; at_time timestamptz;
  piece integer; slot integer; old_slot integer; displaced jsonb; board jsonb; tray jsonb; total integer; complete boolean:=false; i integer;
  grid jsonb; width integer; height integer; position integer; next_position integer; x integer; y integer; dx integer; dy integer; visited jsonb;
begin
  participant:=private.require_student();
  if p_level is null or p_level not between 2 and 4 or p_revision is null or p_revision<0 or jsonb_typeof(p_move) is distinct from 'object'
    then raise exception 'invalid_move' using errcode='22023';end if;
  perform private.arena_check_gate(participant,p_level);
  select c.config into course from private.arena_course c where singleton;config:=course->'levels'->(p_level-1);
  select * into target from public.puzzles where id=(config->>'puzzle_id')::uuid for update;
  at_time:=clock_timestamp();
  if target.status<>'published' or (target.opens_at is not null and target.opens_at>at_time) or (target.closes_at is not null and target.closes_at<=at_time)
    then raise exception 'course_unavailable' using errcode='55000';end if;
  select * into attempt from private.arena_attempts where student_id=participant and level=p_level for update;
  if not found then raise exception 'invalid_move' using errcode='22023';end if;
  if attempt.status='active' and attempt.expires_at<=at_time then
    update private.arena_attempts set status='expired',finished_at=at_time where student_id=participant and level=p_level returning * into attempt;
  end if;
  if attempt.status<>'active' then return private.arena_attempt_result(attempt,config);end if;
  if attempt.revision<>p_revision then return private.arena_attempt_result(attempt,config,'stale_move');end if;
  if p_level in (2,3) then
    if p_move->>'piece' is null or p_move->>'slot' is null or (p_move->>'piece') !~ '^\d+$' or (p_move->>'slot') !~ '^\d+$'
      then raise exception 'invalid_move' using errcode='22023';end if;
    piece:=(p_move->>'piece')::integer;slot:=(p_move->>'slot')::integer;
    board:=attempt.state->'board';tray:=attempt.state->'tray';total:=jsonb_array_length(board);
    if piece not between 0 and total-1 or slot not between 0 and total-1 then raise exception 'invalid_move' using errcode='22023';end if;
    old_slot:=null;
    for i in 0..total-1 loop if board->>i=piece::text then old_slot:=i;exit;end if;end loop;
    if old_slot is null and not tray @> jsonb_build_array(piece) then raise exception 'invalid_move' using errcode='22023';end if;
    if old_slot=slot then return private.arena_attempt_result(attempt,config);end if;
    displaced:=board->slot;board:=jsonb_set(board,array[slot::text],to_jsonb(piece));
    if old_slot is not null then board:=jsonb_set(board,array[old_slot::text],displaced);
    else
      select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into tray from jsonb_array_elements(tray) with ordinality where value<>to_jsonb(piece);
      if displaced<>'null'::jsonb then tray:=tray||jsonb_build_array(displaced);end if;
    end if;
    attempt.state:=jsonb_build_object('board',board,'tray',tray);complete:=true;
    for i in 0..total-1 loop if board->>i is distinct from i::text then complete:=false;exit;end if;end loop;
  else
    grid:=config->'settings'->'grid';width:=length(grid->>0);height:=jsonb_array_length(grid);
    position:=(attempt.state->>'position')::integer;x:=position%width;y:=position/width;
    case p_move->>'direction' when 'up' then dx:=0;dy:=-1;when 'down' then dx:=0;dy:=1;
      when 'left' then dx:=-1;dy:=0;when 'right' then dx:=1;dy:=0;else raise exception 'invalid_move' using errcode='22023';end case;
    x:=x+dx;y:=y+dy;
    if x<0 or y<0 or x>=width or y>=height or substr(grid->>y,x+1,1)<>'.' then raise exception 'invalid_move' using errcode='22023';end if;
    next_position:=y*width+x;visited:=attempt.state->'visited';
    if not visited @> to_jsonb(next_position) then visited:=visited||jsonb_build_array(next_position);end if;
    attempt.state:=jsonb_build_object('position',next_position,'visited',visited,'moves',(attempt.state->>'moves')::integer+1);
    complete:=next_position=(height-1)*width+width-2;
  end if;
  -- Recheck after work, so processing/lock waits cannot extend a deadline.
  at_time:=clock_timestamp();
  update private.arena_attempts set state=attempt.state,revision=revision+1,
    status=case when expires_at<=at_time then 'expired' when complete then 'completed' else 'active' end,
    finished_at=case when expires_at<=at_time or complete then at_time else null end
    where student_id=participant and level=p_level returning * into attempt;
  if attempt.status='completed' then
    insert into public.submissions(student_id,puzzle_id,submitted_answer,is_correct,awarded_points,submitted_at)
      values(participant,target.id,'Timed visual challenge completed',true,target.points,at_time)
      on conflict(student_id,puzzle_id) where is_correct do nothing;
  end if;
  return private.arena_attempt_result(attempt,config);
end;
$$;

-- Assigned challenges are shown by arena_progress, not as standalone answer forms.
create or replace function private.student_puzzles(p_page integer,p_page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare participant uuid; results jsonb; total bigint; at_time timestamptz;
begin
  participant:=private.require_student();at_time:=clock_timestamp();
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100
    then raise exception 'invalid_input' using errcode='22023';end if;
  select count(*) into total from public.puzzles where arena_level is null and status='published' and (opens_at is null or opens_at<=at_time) and (closes_at is null or closes_at>at_time);
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into results from (
    select p.id,p.title,p.description,p.points,p.difficulty,p.status,p.opens_at,p.closes_at,
      exists(select 1 from public.submissions s where s.student_id=participant and s.puzzle_id=p.id and s.is_correct) as solved,
      (select count(*) from public.submissions s where s.student_id=participant and s.puzzle_id=p.id) as attempt_count
    from public.puzzles p where p.arena_level is null and p.status='published' and (opens_at is null or opens_at<=at_time) and (closes_at is null or closes_at>at_time)
    order by p.created_at,p.id limit p_page_size offset(p_page-1)*p_page_size) r;
  return jsonb_build_object('rows',results,'total',total,'page',p_page,'page_size',p_page_size);
end;
$$;

create function public.admin_arena() returns jsonb language sql security invoker
begin atomic select private.admin_arena();end;
create function public.admin_save_arena(p_config jsonb,p_expected_updated_at timestamptz) returns jsonb language sql security invoker
begin atomic select private.admin_save_arena(p_config,p_expected_updated_at);end;
create function public.arena_progress() returns jsonb language sql security invoker
begin atomic select private.arena_progress();end;
create function public.arena_start(p_level integer) returns jsonb language sql security invoker
begin atomic select private.arena_start(p_level);end;
create function public.arena_move(p_level integer,p_move jsonb,p_revision integer) returns jsonb language sql security invoker
begin atomic select private.arena_move(p_level,p_move,p_revision);end;

revoke all on function private.arena_complete(uuid,integer),private.arena_check_gate(uuid,integer),private.arena_lock_terms(),private.arena_validate_maze(jsonb),
  private.arena_maze_path(jsonb,integer,integer),
  private.arena_scoring_terms(jsonb),
  private.arena_attempt_result(private.arena_attempts,jsonb,text),private.admin_arena(),private.admin_save_arena(jsonb,timestamptz),
  private.arena_progress(),private.arena_start(integer),private.arena_move(integer,jsonb,integer),private.submit_answer(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_arena(),public.admin_save_arena(jsonb,timestamptz),public.arena_progress(),public.arena_start(integer),
  public.arena_move(integer,jsonb,integer),public.submit_answer(uuid,text) from public,anon,authenticated;
grant execute on function private.admin_arena(),private.admin_save_arena(jsonb,timestamptz),private.arena_progress(),private.arena_start(integer),
  private.arena_move(integer,jsonb,integer),private.submit_answer(uuid,text),public.admin_arena(),public.admin_save_arena(jsonb,timestamptz),
  public.arena_progress(),public.arena_start(integer),public.arena_move(integer,jsonb,integer),public.submit_answer(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
