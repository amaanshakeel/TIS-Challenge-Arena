-- Run ONLY in Supabase SQL Editor with the trusted postgres role after schema.sql.
-- 1. Register the intended admin through the website with valid identifying information.
-- 2. Confirm the email if confirmation is enabled.
-- 3. Copy the user's exact UUID from Authentication > Users and verified email.
-- 4. Replace BOTH placeholders below. Never put a password or private key in this file.
-- 5. Run this script once and then sign in again. No public promotion RPC exists.
begin;
do $$
declare
  intended_id uuid := '00000000-0000-0000-0000-000000000000';
  intended_email text := 'REPLACE_WITH_VERIFIED_ADMIN_EMAIL';
begin
  if intended_id = '00000000-0000-0000-0000-000000000000' or intended_email = 'REPLACE_WITH_VERIFIED_ADMIN_EMAIL' then
    raise exception 'Replace the admin UUID and email before running this script.';
  end if;
  if not exists (select 1 from auth.users where id=intended_id and lower(email)=lower(btrim(intended_email))) then
    raise exception 'No matching Auth user. Verify UUID and email.';
  end if;
  update public.profiles set role='admin',status='approved',status_before_termination=null where id=intended_id;
  if not found then raise exception 'No profile. Register this account through the website first.'; end if;
  insert into public.admin_audit(actor_id,action,target_id,details)
    values (intended_id,'initial_admin_provisioning',intended_id,'{"source":"trusted_sql_editor"}'::jsonb);
end;
$$;
commit;
