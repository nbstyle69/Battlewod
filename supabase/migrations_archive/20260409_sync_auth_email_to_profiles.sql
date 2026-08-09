-- Trigger: sync auth.users.email → public.profiles.email on any auth user update
-- This ensures that when a user confirms an email change via Supabase Auth,
-- the profiles table is automatically updated.

create or replace function public.sync_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end;
$$;

-- Drop if exists to avoid duplicate
drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.sync_auth_email();
