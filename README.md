# metel

> Current baseline (2026-03-06):
> metel is operating at a **Phase 3 Execution Control Platform** baseline
> with **RBAC full_guard production deployment** active.
> The source-of-truth plan is `docs/overhaul-20260302.md`.

[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](#)
[![Frontend](https://img.shields.io/badge/frontend-Next.js-000000?logo=nextdotjs&logoColor=white)](#)
[![Database](https://img.shields.io/badge/database-Supabase-3FCF8E?logo=supabase&logoColor=white)](#)
[![Deploy Backend](https://img.shields.io/badge/deploy-Railway-7B3FE4?logo=railway&logoColor=white)](#)
[![Deploy Frontend](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel&logoColor=white)](#)
[![Status](https://img.shields.io/badge/status-phase3--rbac-green)](#)

## What is metel

**metel** is an **AI Action Control Platform** — infrastructure that manages how
AI agents execute actions against your organization's SaaS tools in a safe,
controlled, and auditable way.

### The Problem

As AI agents evolve from simple assistants to autonomous actors, organizations
face a new class of operational risk:

- **Uncontrolled execution**: AI agents call SaaS APIs (create issues, update
  databases, send messages) without centralized oversight.
- **Privilege conflicts**: Multiple agents with different permission levels
  operate on the same workspace, creating unsafe mutations.
- **No auditability**: There is no unified log of what agents did, when, and why
  — making incident response and compliance nearly impossible.
- **Scaling danger**: Moving from 3–10 agents to 30+ without control
  infrastructure turns every agent into a potential incident source.

### The Solution

metel sits between AI agents and SaaS APIs as an **execution control layer**:

```text
AI Agents (Claude / GPT / CrewAI / Custom)
            ↓
      MCP Gateway Layer       ← standard agent interface
            ↓
  Execution Control Core      ← policy · risk · audit · RBAC
            ↓
        SaaS APIs             ← Notion / Linear / ...
```

Every tool call goes through metel's control core, which enforces:

| Control              | What it does                                                  |
|----------------------|---------------------------------------------------------------|
| **Authentication**   | API key per agent/team with scoped permissions                |
| **Schema Validation**| JSON Schema check on every tool input before execution        |
| **Policy Engine**    | Allow/deny rules by key, team, and tool (merge-based)         |
| **Risk Gate**        | Blocks destructive operations (delete, archive) by default    |
| **Resolver**         | Converts human-readable names to system IDs (name→id)         |
| **Retry & Quota**    | Per-key rate limits, retry with backoff, dead-letter alerting  |
| **Audit Log**        | Every execution recorded with actor, decision, latency, error |
| **RBAC**             | Organization-level role control (owner / admin / member)      |

### Core Position

- **Not** an "employee AI usage monitor."
- **Not** just a SaaS connector or integration wrapper.
- metel is a **control plane for AI agents that execute real actions** —
  designed for teams scaling from a handful of agents to dozens, where control
  must be designed before risk becomes unmanageable.

### Who It's For

- **Platform / DevOps teams** deploying AI agents against production SaaS
- **Security / Compliance leads** who need audit trails and policy enforcement
- **Engineering teams** building multi-agent systems that touch real data

## Live Product

- Frontend: `https://metel-frontend.vercel.app`
- Backend: `https://metel-production.up.railway.app`

## How It Works (Current Baseline)

```text
[AI Agent / Client]
   |
   v
[MCP Gateway Layer]
   |
   v
[Execution Control Core]
   |-- API Key Auth + RBAC (owner/admin/member)
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

### Dashboard (V2)

metel includes a full operational dashboard built on a route-based architecture
(`/dashboard/overview`, `/dashboard/access/api-keys`, etc.) with:

- **Role-based menu visibility**: Owner sees everything, Admin sees
  Admin/Ops (read-only sensitive actions), Member sees self-scoped views.
- **Design system**: Vercel + Linear inspired UI with Datadog-style ops signals,
  light/dark theme, status badges, and KPI cards.
- **Pages**: Overview, API Keys, Organizations, Team Policy, MCP Usage,
  Policy Simulator, Audit Events, Audit Settings, Integrations (Webhooks/OAuth),
  Admin/Ops, Profile.

## What Works Now

Service connection (OAuth / status / disconnect):
- Notion
- Linear

MCP and control features (Phase 3 baseline):
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

RBAC (production active):
- Role-based access control: `owner`, `admin`, `member`
- `require_role` + `require_scope` FastAPI dependency guards
- Read/write guard feature flags for staged rollout
- `/api/me/permissions` endpoint with role, scopes, capabilities
- 403 standard error codes (`access_denied`, `scope_mismatch`, `insufficient_role`)
- Audit logging for access-denied events

## Reliability Model (Current)

Guardrails currently in runtime:
- API key authentication + organization RBAC
- tool/service allowlist + deny policy by key/team
- schema-based input validation + resolver pipeline
- risk gate for mutation-class tools
- per-key quota/rate limit + retry/backoff
- dead-letter transition + alerting (Slack/SIEM/ticket webhook)
- structured execution/audit logging
- role-scoped data filtering (member=self, admin=org, owner=global)

Quality gates in repo:
- phase3 regression script (`backend/scripts/run_phase3_regression.sh`)
- RBAC smoke tests (`backend/scripts/run_phase3_rbac_smoke.sh`)
- route/core unit tests (teams/org/audit/admin/integrations/dead-letter/RBAC)
- tool spec validation script (`backend/scripts/check_tool_specs.py`)
- dashboard V2 QA stage gate (`backend/scripts/run_dashboard_v2_qa_stage_gate.sh`)
- RBAC rollout stage gate (`backend/scripts/run_rbac_rollout_stage_gate.sh`)
- RBAC monitoring snapshot (`backend/scripts/run_rbac_monitoring_snapshot.sh`)

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

- RBAC full_guard is active in production; 48-hour monitoring is in progress.
- Provider-side constraints still apply (OAuth scopes, upstream API limits, token status).
- Advanced enterprise scope remains for next stages:
  - policy DSL
  - SSO/SAML, SOC2 process
  - usage-based billing

## Direction (Execution-First Roadmap)

Near term:
- complete RBAC 48h production monitoring
- standardize SIEM/ticket templates (Jira/Linear mapping)
- enterprise approval workflows (dual-approval, escalation)

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
- RBAC rollout controls:
  - `RBAC_READ_GUARD_ENABLED`
  - `RBAC_WRITE_GUARD_ENABLED`
  - `UI_RBAC_STRICT_ENABLED`
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
./scripts/run_phase3_rbac_smoke.sh
```

RBAC rollout/operations helpers:

```bash
cd backend
# staging/prod rollout gate
MODE=full_guard ./scripts/run_rbac_rollout_stage_gate.sh

# 48h monitoring snapshot
./scripts/run_rbac_monitoring_snapshot.sh
```

Dashboard V2 QA gate:

```bash
cd backend
./scripts/run_dashboard_v2_qa_stage_gate.sh
```

Tool spec validation:

```bash
cd backend
source .venv/bin/activate
python scripts/check_tool_specs.py --json
```

## Repository Structure

```text
frontend/                  Next.js landing + dashboard (V2 route-based)
backend/                   FastAPI + MCP/control routes
backend/app/core/          authz (RBAC), config, state
backend/agent/             registry / tool_runner / tool specs
backend/agent/tool_specs/  service tool specs (json)
backend/tests/             unit + integration tests (RBAC/route/IDOR)
backend/scripts/           regression, rollout, monitoring scripts
docs/                      plans, release notes, architecture notes
docs/sql/                  schema migration scripts
docs/sql/legacy/           archived (non-baseline) migrations
```

## Related Docs

- `docs/overhaul-20260302.md` (source-of-truth)
- `docs/dashboard-ia-navigation-proposal-20260305.md` (dashboard IA/routing)
- `docs/dashboard-design-system-draft-20260305.md` (design system tokens)
- `docs/rbac-production-monitoring-log-20260305.md` (RBAC 48h monitoring)
- `docs/rbac-production-rollout-runbook-20260304.md` (RBAC rollout runbook)
- `docs/rbac-dashboard-e2e-smoke-checklist-20260304.md` (RBAC e2e smoke)
- `docs/phase3-gap-closing-backlog-20260303.md` (phase3 completion + ops verification)
- `docs/mcp_smoke_test_checklist.md` (deploy smoke test procedure)
- `docs/sql/legacy/README.md` (migration policy)
