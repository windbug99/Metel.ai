create table if not exists public.user_security_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  mfa_enabled boolean not null default false,
  session_timeout_minutes integer not null default 60,
  password_rotation_days integer not null default 90,
  updated_at timestamptz not null default now(),
  check (session_timeout_minutes between 15 and 1440),
  check (password_rotation_days between 30 and 365)
);

alter table if exists public.user_security_settings enable row level security;

drop policy if exists "user_security_settings_select_own" on public.user_security_settings;
create policy "user_security_settings_select_own"
  on public.user_security_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_security_settings_insert_own" on public.user_security_settings;
create policy "user_security_settings_insert_own"
  on public.user_security_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_security_settings_update_own" on public.user_security_settings;
create policy "user_security_settings_update_own"
  on public.user_security_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
