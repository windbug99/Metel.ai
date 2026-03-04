import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.api_keys import api_key_drilldown
from app.routes.audit import get_audit_event_detail
from app.routes.integrations import WebhookUpdateRequest, update_webhook
from app.routes.teams import TeamUpdateRequest, update_team


def _request(path: str, method: str = "GET") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


def test_api_key_drilldown_blocks_other_users_key(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self.ops: list[tuple[str, str, object]] = []

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, field: str, value):
            self.ops.append(("eq", field, value))
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "api_keys":
                # Simulate foreign key_id access attempt: no row under caller user_id.
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-a"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-a", role=Role.MEMBER, org_ids=set(), team_ids=set())

    monkeypatch.setattr("app.routes.api_keys.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.api_keys.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.api_keys.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.api_keys.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(api_key_drilldown(_request("/api/api-keys/999/drilldown"), key_id=999, days=7))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "api_key_not_found"
    else:
        assert False, "expected HTTPException"


def test_update_team_blocks_other_owners_team(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams":
                # Team exists but not owned by caller => scoped query returns no rows.
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-a"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-a", role=Role.ADMIN, org_ids={1}, team_ids={1})

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(update_team(_request("/api/teams/77", "PATCH"), "77", TeamUpdateRequest(name="x")))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "team_not_found"
    else:
        assert False, "expected HTTPException"


def test_update_webhook_blocks_other_owners_webhook(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "webhook_subscriptions":
                # Webhook exists but not owned by caller => scoped query returns no rows.
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-a"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-a", role=Role.ADMIN, org_ids={1}, team_ids={1})

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.integrations.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(
            update_webhook(
                _request("/api/integrations/webhooks/42", "PATCH"),
                "42",
                WebhookUpdateRequest(name="updated"),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "webhook_not_found"
    else:
        assert False, "expected HTTPException"


def test_get_audit_event_detail_member_cannot_access_other_users_event(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "tool_calls":
                return SimpleNamespace(
                    data=[
                        {
                            "id": 7,
                            "user_id": "user-b",
                            "request_id": "req-7",
                            "trace_id": "trace-7",
                            "api_key_id": 10,
                            "tool_name": "linear_list_issues",
                            "connector": "linear",
                            "status": "success",
                            "error_code": None,
                            "latency_ms": 30,
                            "request_payload": None,
                            "resolved_payload": None,
                            "risk_result": None,
                            "upstream_status": None,
                            "retry_count": 0,
                            "backoff_ms": 0,
                            "masked_fields": [],
                            "created_at": "2026-03-03T00:01:00+00:00",
                        }
                    ]
                )
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-a"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-a", role=Role.MEMBER, org_ids=set(), team_ids=set())

    monkeypatch.setattr("app.routes.audit.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.audit.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.audit.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.audit.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(get_audit_event_detail(_request("/api/audit/events/7"), event_id=7))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "audit_event_not_found"
    else:
        assert False, "expected HTTPException"
