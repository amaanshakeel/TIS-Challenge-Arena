-- TIS Challenge Arena | Part 1 foundation
-- Apply ONCE to a fresh Supabase project as the SQL Editor's trusted postgres role.
-- This is transactional: a failed statement rolls back the entire foundation.
-- Future parts extend this schema; do not rerun it over an installed application.
begin;

create schema private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 100 and full_name = btrim(full_name) and full_name !~ '[[:cntrl:]]'),
  display_name text not null check (char_length(display_name) between 2 and 100 and display_name !~ '[[:cntrl:]]'),
  email text not null check (char_length(email) between 3 and 254 and email = lower(btrim(email))),
  registration_number text not null check (char_length(registration_number) between 1 and 50 and registration_number = btrim(registration_number) and registration_number !~ '[[:cntrl:]]'),
  department text not null check (char_length(department) between 2 and 100 and department = btrim(department) and department !~ '[[:cntrl:]]'),
  semester smallint not null check (semester between 1 and 12),
  role text not null default 'student' check (role in ('student','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','terminated')),
  -- Part 2 restoration will use this field to preserve pre-termination status.
  status_before_termination text check (status_before_termination in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_registration_number_unique on public.profiles (lower(btrim(registration_number)));
create index profiles_status_created_idx on public.profiles (status, created_at desc);

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 10000),
  points integer not null check (points between 1 and 10000),
  difficulty text check (difficulty in ('easy','medium','hard')),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint puzzles_valid_dates check (opens_at is null or closes_at is null or opens_at < closes_at)
);
create index puzzles_availability_idx on public.puzzles (status, opens_at, closes_at);
create index puzzles_creator_idx on public.puzzles (created_by);

create table public.puzzle_answers (
  puzzle_id uuid primary key references public.puzzles(id) on delete restrict,
  correct_answer text not null check (char_length(btrim(correct_answer)) between 1 and 500),
  -- Later comparison will trim outer whitespace and fold case by default.
  case_sensitive boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  puzzle_id uuid not null references public.puzzles(id) on delete restrict,
  submitted_answer text not null check (char_length(btrim(submitted_answer)) between 1 and 500),
  is_correct boolean not null,
  -- Snapshot: totals must never depend on mutable puzzle points.
  awarded_points integer not null default 0,
  submitted_at timestamptz not null default now(),
  constraint submissions_points_valid check ((is_correct and awarded_points between 1 and 10000) or (not is_correct and awarded_points = 0))
);
create unique index submissions_one_success_per_puzzle on public.submissions (student_id, puzzle_id) where is_correct;
create index submissions_student_time_idx on public.submissions (student_id, submitted_at desc);
create index submissions_puzzle_time_idx on public.submissions (puzzle_id, submitted_at desc);

create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_time_idx on public.admin_audit (created_at desc);
create index admin_audit_actor_idx on public.admin_audit (actor_id);

alter table public.profiles enable row level security;
alter table public.puzzles enable row level security;
alter table public.puzzle_answers enable row level security;
alter table public.submissions enable row level security;
alter table public.admin_audit enable row level security;

-- Remove any inherited Supabase default table grants before adding specific reads.
revoke all on public.profiles, public.puzzles, public.puzzle_answers, public.submissions, public.admin_audit from public, anon, authenticated;
revoke all on sequence public.admin_audit_id_seq from public, anon, authenticated;
grant select on public.profiles, public.puzzles, public.puzzle_answers, public.submissions, public.admin_audit to authenticated;

-- Elevated helpers avoid recursive RLS lookup. No input IDs or role claims are trusted.
-- private is NOT exposed in Data API settings; schema USAGE is intentionally denied.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'approved');
$$;
create function private.is_approved_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'student' and status = 'approved');
$$;
revoke all on function private.is_admin(), private.is_approved_student() from public, anon, authenticated;
grant execute on function private.is_admin(), private.is_approved_student() to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy puzzles_read on public.puzzles for select to authenticated
  using ((select private.is_admin()) or (
    (select private.is_approved_student()) and status = 'published'
    and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at > now())
  ));
create policy answers_admin_read on public.puzzle_answers for select to authenticated
  using ((select private.is_admin()));
create policy submissions_read on public.submissions for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_admin()));
create policy audit_admin_read on public.admin_audit for select to authenticated
  using ((select private.is_admin()));
-- There are deliberately no client write grants/policies. Admin mutations come in Part 2.

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  person_name text := btrim(coalesce(meta->>'full_name',''));
  reg text := btrim(coalesce(meta->>'registration_number',''));
  dept text := btrim(coalesce(meta->>'department',''));
  sem text := coalesce(meta->>'semester','');
begin
  if char_length(person_name) not between 2 and 100 or person_name ~ '[[:cntrl:]]'
    or char_length(reg) not between 1 and 50 or reg ~ '[[:cntrl:]]'
    or char_length(dept) not between 2 and 100 or dept ~ '[[:cntrl:]]'
    or sem !~ '^(?:[1-9]|1[0-2])$'
    or new.email is null or char_length(new.email) not between 3 and 254
  then raise exception 'invalid_registration' using errcode = '22023'; end if;
  insert into public.profiles (id,full_name,display_name,email,registration_number,department,semester,role,status)
    values (new.id,person_name,person_name,lower(btrim(new.email)),reg,dept,sem::smallint,'student','pending');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.sync_auth_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(btrim(new.email)) where id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_auth_email() from public, anon, authenticated;
create trigger on_auth_email_updated after update of email on auth.users for each row
  when (old.email is distinct from new.email) execute function private.sync_auth_email();

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger puzzles_updated before update on public.puzzles for each row execute function private.set_updated_at();
create trigger answers_updated before update on public.puzzle_answers for each row execute function private.set_updated_at();

-- Protect scoring terms once any correct solve exists, even from accidental admin edits.
create function private.lock_scored_terms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare puzzle_key uuid;
begin
  if tg_table_name = 'puzzles' then
    if new.points is not distinct from old.points then return new; end if;
    puzzle_key := old.id;
  else
    if new.correct_answer is not distinct from old.correct_answer and new.case_sensitive is not distinct from old.case_sensitive then return new; end if;
    puzzle_key := old.puzzle_id;
  end if;
  if exists (select 1 from public.submissions where puzzle_id=puzzle_key and is_correct) then
    raise exception 'scoring_locked' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_scored_terms() from public, anon, authenticated;
create trigger puzzles_lock_scored_terms before update of points on public.puzzles for each row execute function private.lock_scored_terms();
create trigger answers_lock_scored_terms before update of correct_answer,case_sensitive on public.puzzle_answers for each row execute function private.lock_scored_terms();

comment on table public.puzzle_answers is 'Protected answers. Never select from a student or public interface.';
comment on table public.submissions is 'Trusted writes only. Submission RPC and leaderboard arrive in Part 3.';
comment on table public.profiles is 'Auth is authoritative for email/password. Signup metadata cannot choose role/status.';
commit;
