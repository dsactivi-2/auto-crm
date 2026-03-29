-- Fix: RLS-Rekursion auf profiles beheben
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles for select using (public.is_admin());
create policy "Admins can update all profiles" on public.profiles for update using (public.is_admin());

drop policy if exists "Admins can view all credentials" on public.crm_credentials;
create policy "Admins can view all credentials" on public.crm_credentials for select using (public.is_admin());

drop policy if exists "Admins can view all activities" on public.activities;
create policy "Admins can view all activities" on public.activities for select using (public.is_admin());

drop policy if exists "Admins can view all messages" on public.chat_messages;
create policy "Admins can view all messages" on public.chat_messages for select using (public.is_admin());

drop policy if exists "Admins can view system logs" on public.system_logs;
create policy "Admins can view system logs" on public.system_logs for select using (public.is_admin());

drop policy if exists "Admins can update logs" on public.system_logs;
create policy "Admins can update logs" on public.system_logs for update using (public.is_admin());
