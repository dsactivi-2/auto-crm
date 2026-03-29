-- ============================================================
-- CRM Platform — Datenbank-Schema
-- ============================================================

-- 1. User-Profile (erweitert Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS aktivieren
alter table public.profiles enable row level security;

-- Hilfsfunktion: Admin-Check ohne RLS-Rekursion (security definer)
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Admin sieht alle, User nur sich selbst
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatisch Profil erstellen bei Registrierung
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    -- Erster User wird Admin
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'user' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. CRM-Credentials (verschlüsselt gespeichert)
create table public.crm_credentials (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null unique,
  crm_username text not null,
  crm_password_encrypted text not null, -- AES-256 verschlüsselt
  crm_url text not null default 'https://crm.job-step.com',
  is_valid boolean default null, -- null = nicht geprüft, true/false nach Test
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_credentials enable row level security;

create policy "Users can manage own credentials"
  on public.crm_credentials for all
  using (auth.uid() = user_id);

create policy "Admins can view all credentials"
  on public.crm_credentials for select
  using (
    public.is_admin()
  );

-- Index für schnelle Credential-Abfragen
create index idx_crm_credentials_user_id on public.crm_credentials(user_id);

-- 3. Activity Log
create table public.activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  action text not null,             -- z.B. "kandidaten_suchen", "lead_erstellen"
  module text not null,             -- z.B. "Kandidaten", "Sales", "Finanzen"
  details jsonb default '{}',       -- Zusätzliche Daten (Suchbegriff, ID, etc.)
  status text not null default 'success' check (status in ('success', 'error', 'pending')),
  error_message text,
  duration_ms integer,              -- Wie lange die Aktion gedauert hat
  created_at timestamptz not null default now()
);

alter table public.activities enable row level security;

-- User sieht eigene Aktivitäten
create policy "Users can view own activities"
  on public.activities for select
  using (auth.uid() = user_id);

-- Admin sieht alle
create policy "Admins can view all activities"
  on public.activities for select
  using (
    public.is_admin()
  );

-- Jeder kann eigene Aktivitäten erstellen (via API)
create policy "Users can insert own activities"
  on public.activities for insert
  with check (auth.uid() = user_id);

-- Index für schnelle Abfragen
create index idx_activities_user_id on public.activities(user_id);
create index idx_activities_created_at on public.activities(created_at desc);
create index idx_activities_module on public.activities(module);

-- 4. Chat-Nachrichten (Verlauf pro User)
create table public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb default '{}',      -- z.B. welches Modul angesprochen wurde
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "Users can manage own messages"
  on public.chat_messages for all
  using (auth.uid() = user_id);

create policy "Admins can view all messages"
  on public.chat_messages for select
  using (
    public.is_admin()
  );

create index idx_chat_messages_user_id on public.chat_messages(user_id, created_at);

-- 5. System-Logs (Fehler, Warnungen, System-Events)
create table public.system_logs (
  id uuid default gen_random_uuid() primary key,
  level text not null default 'error' check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  source text not null,               -- z.B. "api/chat", "playwright", "middleware", "cron"
  message text not null,
  user_id uuid references public.profiles on delete set null, -- optional: welcher User betroffen
  metadata jsonb default '{}',         -- Stack trace, Request-Details, etc.
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.system_logs enable row level security;

-- Nur Admins sehen System-Logs
create policy "Admins can view system logs"
  on public.system_logs for select
  using (
    public.is_admin()
  );

create policy "System can insert logs"
  on public.system_logs for insert
  with check (true);

create policy "Admins can update logs"
  on public.system_logs for update
  using (
    public.is_admin()
  );

create index idx_system_logs_level on public.system_logs(level);
create index idx_system_logs_source on public.system_logs(source);
create index idx_system_logs_created_at on public.system_logs(created_at desc);
create index idx_system_logs_resolved on public.system_logs(resolved) where resolved = false;
create index idx_system_logs_user_id on public.system_logs(user_id);

-- 6. Hilfsfunktion: Updated_at automatisch setzen
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

create trigger set_updated_at_credentials
  before update on public.crm_credentials
  for each row execute procedure public.update_updated_at();
