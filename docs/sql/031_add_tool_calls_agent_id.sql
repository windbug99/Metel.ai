alter table if exists public.tool_calls
  add column if not exists agent_id bigint references public.agents(id) on delete set null;

create index if not exists idx_tool_calls_agent_id_created_at
  on public.tool_calls (agent_id, created_at desc);
