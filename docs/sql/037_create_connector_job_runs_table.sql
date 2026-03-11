create table if not exists public.connector_job_runs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  job_type text not null,
  external_job_id text,
  resource_id text,
  resource_title text,
  status text not null,
  request_payload jsonb,
  result_payload jsonb,
  download_urls text[],
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, job_type, external_job_id)
);

create index if not exists idx_connector_job_runs_user_updated_at
  on public.connector_job_runs (user_id, updated_at desc);

create index if not exists idx_connector_job_runs_provider_job_type
  on public.connector_job_runs (provider, job_type, updated_at desc);

alter table if exists public.connector_job_runs enable row level security;

drop policy if exists "connector_job_runs_select_own" on public.connector_job_runs;
create policy "connector_job_runs_select_own"
  on public.connector_job_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "connector_job_runs_insert_own" on public.connector_job_runs;
create policy "connector_job_runs_insert_own"
  on public.connector_job_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "connector_job_runs_update_own" on public.connector_job_runs;
create policy "connector_job_runs_update_own"
  on public.connector_job_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
