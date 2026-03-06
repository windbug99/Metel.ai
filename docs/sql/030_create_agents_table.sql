create table if not exists public.agents (
  id bigserial primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create index if not exists idx_agents_org_team_created_at
  on public.agents (organization_id, team_id, created_at desc);

create index if not exists idx_agents_team_id
  on public.agents (team_id);

alter table if exists public.agents enable row level security;

-- Service-role based backend access is the primary path; keep authenticated policy scoped.
drop policy if exists "agents_select_member_scope" on public.agents;
create policy "agents_select_member_scope"
  on public.agents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = agents.team_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.org_memberships om
      where om.organization_id = agents.organization_id
        and om.user_id = auth.uid()
        and lower(coalesce(om.role, 'member')) in ('owner', 'admin')
    )
  );
