alter table if exists public.org_role_change_requests
  add column if not exists request_type text not null default 'change_request',
  add column if not exists review_reason text,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_org_role_change_requests_requested_by
  on public.org_role_change_requests (requested_by, created_at desc);

create index if not exists idx_org_role_change_requests_status
  on public.org_role_change_requests (status, created_at desc);

update public.org_role_change_requests
set request_type = 'change_request'
where request_type is null or btrim(request_type) = '';
