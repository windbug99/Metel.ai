# metel

> Current baseline (2026-03-04):
> metel is now operating at a **Phase 3 Execution Control Platform** baseline
> (MCP Gateway + Policy/Audit/Ops Control Plane).
> The source-of-truth plan is `docs/overhaul-20260302.md`.

[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](#)
[![Frontend](https://img.shields.io/badge/frontend-Next.js-000000?logo=nextdotjs&logoColor=white)](#)
[![Database](https://img.shields.io/badge/database-Supabase-3FCF8E?logo=supabase&logoColor=white)](#)
[![Deploy Backend](https://img.shields.io/badge/deploy-Railway-7B3FE4?logo=railway&logoColor=white)](#)
[![Deploy Frontend](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel&logoColor=white)](#)
[![Status](https://img.shields.io/badge/status-phase3-green)](#)

metel is an AI Execution Control Platform for teams that are starting to run
multiple AI agents against real SaaS systems.

Core position:
- Not an "employee AI usage monitor"
- A control plane for "AI agents that execute actions"

## Live Product

- Frontend: `https://metel-frontend.vercel.app`
- Backend: `https://metel-production.up.railway.app`

## Why metel

The market is moving from:
- employee asks AI -> human manually executes
to:
- AI agents -> directly execute SaaS actions

This shift creates operational risk:
- unknown agent actions
- privilege conflicts and unsafe mutations
- no auditability at team/org level
- difficult rollback and incident response

metel targets teams that are likely to move from 3-10 agents to 30+ within 12 months.
If control is not designed early, scaling agents becomes high-risk and expensive.

metel focuses on:
- controlled MCP execution
- policy/risk gate enforcement
- audit/export and ops diagnostics
- reliability automation (retry/dead-letter/alerts)

## How It Works (Current Baseline)

```text
[AI Agent / Client]
   |
   v
[MCP Gateway Layer]
   |
   v
[Execution Control Core]
   |-- API Key Auth
   |-- Tool Registry + Schema Validation
   |-- Team/Key Policy Merge + Risk Gate
   |-- Resolver + Retry/Backoff + Quota
   |-- Audit Log + Usage Analytics
   |-- Integrations (Webhook/Export/Dead-letter Alert)
   |-- Admin/Ops Diagnostics + Incident Banner
   |
   v
[SaaS APIs: Notion / Linear]
```

Operationally, metel records:
- API key metadata (`api_keys`)
- execution/audit logs (`tool_calls`)
- structured JSON-RPC error codes

## What Works Now

Service connection (OAuth / status / disconnect):
- Notion
- Linear

MCP and control features (implemented in Phase 3 baseline):
- `POST /mcp/list_tools`
- `POST /mcp/call_tool`
- API key issue/update/revoke/rotate (`/api/api-keys`)
- key-level policy + team scope + drilldown
- team policy + revision + rollback (`/api/teams/*`)
- organization/membership/invite/role-request workflow (`/api/organizations/*`)
- policy simulation (`/api/policies/simulate`)
- audit events/detail/export/settings (`/api/audit/*`)
- usage overview/trends/failure-breakdown/connectors (`/api/tool-calls/*`)
- webhook subscriptions/deliveries/retry processing (`/api/integrations/*`)
- admin diagnostics/system-health/external-health/incident-banner (`/api/admin/*`)

## Reliability Model (Current)

Guardrails currently in runtime:
- API key authentication
- tool/service allowlist + deny policy by key/team
- schema-based input validation + resolver pipeline
- risk gate for mutation-class tools
- per-key quota/rate limit + retry/backoff
- dead-letter transition + alerting (Slack/SIEM/ticket webhook)
- structured execution/audit logging

Quality gates in repo:
- phase3 regression script (`backend/scripts/run_phase3_regression.sh`)
- route/core unit tests (teams/org/audit/admin/integrations/dead-letter)
- tool spec validation script (`backend/scripts/check_tool_specs.py`)

This repository prioritizes deterministic and auditable execution over connector count.

## Example MCP Requests

- `list_tools` with API key
- `call_tool` for `notion_search`
- `call_tool` for `linear_list_issues`

Set env first:

```bash
export API_BASE_URL="https://metel-production.up.railway.app"
export MCP_API_KEY="mcp_live_xxx"
```

`list_tools`:

```bash
curl -sS -X POST "$API_BASE_URL/mcp/list_tools" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"req-list-tools",
    "method":"list_tools",
    "params":{}
  }'
```

`call_tool` (`notion_search`):

```bash
curl -sS -X POST "$API_BASE_URL/mcp/call_tool" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"req-notion-search",
    "method":"call_tool",
    "params":{
      "name":"notion_search",
      "arguments":{"query":"roadmap"}
    }
  }'
```

`call_tool` (`linear_list_issues`):

```bash
curl -sS -X POST "$API_BASE_URL/mcp/call_tool" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"req-linear-issues",
    "method":"call_tool",
    "params":{
      "name":"linear_list_issues",
      "arguments":{"limit":10}
    }
  }'
```

## Current Limits

- Production-like controls are implemented, but formal enterprise hardening is still in progress.
- Provider-side constraints still apply (OAuth scopes, upstream API limits, token status).
- Advanced enterprise scope remains for next stages:
  - dual-approval enforcement
  - full organization RBAC model
  - SSO/SAML, SOC2 process
  - usage-based billing

## Direction (Execution-First Roadmap)

Near term:
- maintain and harden Phase 3 control plane
- standardize SIEM/ticket templates (Jira/Linear mapping)
- refine approval authority model (Owner/Admin/Reviewer split)

Service expansion priority (planned direction, not all implemented):
1. deeper Notion/Linear coverage
2. richer policy/risk governance
3. enterprise security/compliance features

Principle:
- prioritize trust and deterministic behavior over integration count

## Quick Start (Local)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

### Health check

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000/api/health`

## Environment Variables

Use:
- `backend/.env.example`
- `frontend/.env.example`

Key runtime flags:
- `TOOL_SPECS_VALIDATE_ON_STARTUP`
- OAuth provider envs (Notion / Linear / Google)
- Supabase service credentials
- webhook retry and alert controls:
  - `WEBHOOK_RETRY_MAX_RETRIES`
  - `WEBHOOK_RETRY_BASE_BACKOFF_SECONDS`
  - `WEBHOOK_RETRY_MAX_BACKOFF_SECONDS`
  - `DEAD_LETTER_ALERT_WEBHOOK_URL`
  - `DEAD_LETTER_ALERT_MIN_COUNT`
  - `DEAD_LETTER_ALERT_DEDUPE_SECONDS`
  - `ALERT_TICKET_WEBHOOK_URL`

## Testing

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

Recommended regression gates:

```bash
cd backend
./scripts/run_phase3_regression.sh
```

Tool spec validation:

```bash
cd backend
source .venv/bin/activate
python scripts/check_tool_specs.py --json
```

## Repository Structure

```text
frontend/                  Next.js landing + dashboard
backend/                   FastAPI + MCP/control routes
backend/agent/             registry / tool_runner / tool specs
backend/agent/tool_specs/  service tool specs (json)
backend/tests/             unit + integration tests
docs/                      plans, release notes, architecture notes
docs/sql/                  schema migration scripts
docs/sql/legacy/           archived (non-baseline) migrations
```

## Related Docs

- `docs/overhaul-20260302.md` (source-of-truth)
- `docs/phase3-gap-closing-backlog-20260303.md` (phase3 completion + ops verification)
- `docs/mcp_smoke_test_checklist.md` (deploy smoke test procedure)
- `docs/sql/legacy/README.md` (migration policy)
- `docs/work_plan.md` (legacy)
- `docs/service_plan.md` (legacy)
