alter table if exists public.api_keys
  add column if not exists policy_json jsonb;

create index if not exists idx_api_keys_policy_json_gin
  on public.api_keys
  using gin (policy_json);
