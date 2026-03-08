create table if not exists public.org_policies (
  id bigserial primary key,
  organization_id bigint not null unique references public.organizations(id) on delete cascade,
  policy_json jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_policies_org_id
  on public.org_policies (organization_id);

create table if not exists public.org_oauth_policies (
  id bigserial primary key,
  organization_id bigint not null unique references public.organizations(id) on delete cascade,
  policy_json jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_oauth_policies_org_id
  on public.org_oauth_policies (organization_id);

alter table if exists public.org_policies enable row level security;
alter table if exists public.org_oauth_policies enable row level security;

drop policy if exists "org_policies_select_org_member" on public.org_policies;
create policy "org_policies_select_org_member"
  on public.org_policies
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_policies.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "org_policies_upsert_org_owner" on public.org_policies;
create policy "org_policies_upsert_org_owner"
  on public.org_policies
  for all
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_policies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_policies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "org_oauth_policies_select_org_member" on public.org_oauth_policies;
create policy "org_oauth_policies_select_org_member"
  on public.org_oauth_policies
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_oauth_policies.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "org_oauth_policies_upsert_org_owner" on public.org_oauth_policies;
create policy "org_oauth_policies_upsert_org_owner"
  on public.org_oauth_policies
  for all
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_oauth_policies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.org_memberships m
      where m.organization_id = org_oauth_policies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
