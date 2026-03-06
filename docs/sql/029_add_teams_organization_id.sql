alter table if exists public.teams
  add column if not exists organization_id bigint references public.organizations(id) on delete cascade;

create index if not exists idx_teams_organization_id_created_at
  on public.teams (organization_id, created_at desc);

-- Backfill organization_id for legacy teams using creator memberships.
with ranked_org as (
  select
    t.id as team_id,
    m.organization_id,
    row_number() over (
      partition by t.id
      order by
        case lower(coalesce(m.role, 'member'))
          when 'owner' then 1
          when 'admin' then 2
          else 3
        end,
        m.created_at asc,
        m.organization_id asc
    ) as rn
  from public.teams t
  join public.org_memberships m on m.user_id = t.user_id
  where t.organization_id is null
)
update public.teams t
set organization_id = r.organization_id
from ranked_org r
where t.id = r.team_id
  and r.rn = 1
  and t.organization_id is null;

-- Ensure legacy team creators exist in team_memberships for scoped access.
insert into public.team_memberships (team_id, user_id, role, created_at)
select t.id, t.user_id, 'admin', coalesce(t.created_at, now())
from public.teams t
where t.organization_id is not null
on conflict (team_id, user_id)
do update set role = excluded.role;
