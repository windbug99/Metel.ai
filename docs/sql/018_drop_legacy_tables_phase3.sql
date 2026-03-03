-- Phase 3 cleanup: remove legacy tables that are not used by MCP gateway/control platform runtime.
-- Keep tables used by active runtime paths:
--   - users
--   - oauth_tokens
--   - api_keys
--   - tool_calls

begin;

drop table if exists public.pending_actions;
drop table if exists public.pipeline_step_logs;
drop table if exists public.pipeline_links;
drop table if exists public.command_logs;

commit;
