import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.integrations import list_deliveries, list_webhooks, process_deliveries, retry_delivery


def _request(path: str, method: str = "POST") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


@pytest.fixture(autouse=True)
def _default_authz_admin(monkeypatch):
    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-1", role=Role.ADMIN, org_ids={1}, team_ids={1})

    monkeypatch.setattr("app.routes.integrations.get_authz_context", _fake_authz)


def test_process_deliveries_calls_retry_processor(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_process(**kwargs):
        assert kwargs["user_id"] == "user-1"
        assert kwargs["limit"] == 50
        return {"processed": 3, "succeeded": 2, "failed": 1, "skipped": 0}

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.integrations.get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            webhook_retry_max_retries=5,
            webhook_retry_base_backoff_seconds=30,
            webhook_retry_max_backoff_seconds=900,
        ),
    )
    monkeypatch.setattr("app.routes.integrations.process_pending_webhook_retries", _fake_process)

    out = asyncio.run(process_deliveries(_request("/api/integrations/deliveries/process-retries"), limit=50))
    assert out["ok"] is True
    assert out["processed"] == 3
    assert out["succeeded"] == 2
    assert out["failed"] == 1


def test_process_deliveries_sends_dead_letter_alert(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_process(**kwargs):
        assert kwargs["user_id"] == "user-1"
        return {"processed": 1, "succeeded": 0, "failed": 0, "dead_lettered": 1, "skipped": 0}

    called: dict[str, object] = {}

    async def _fake_alert(**kwargs):
        called.update(kwargs)
        return True

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.integrations.get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            webhook_retry_max_retries=5,
            webhook_retry_base_backoff_seconds=30,
            webhook_retry_max_backoff_seconds=900,
            dead_letter_alert_webhook_url="https://hooks.example/abc",
            dead_letter_alert_min_count=1,
        ),
    )
    monkeypatch.setattr("app.routes.integrations.process_pending_webhook_retries", _fake_process)
    monkeypatch.setattr("app.routes.integrations.send_dead_letter_alert", _fake_alert)

    out = asyncio.run(process_deliveries(_request("/api/integrations/deliveries/process-retries"), limit=20))
    assert out["ok"] is True
    assert out["dead_lettered"] == 1
    assert called.get("source") == "process_retries"
    assert called.get("dead_lettered") == 1


def test_retry_delivery_not_found(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_retry(**_kwargs):
        return None

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.integrations.get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            webhook_retry_max_retries=5,
            webhook_retry_base_backoff_seconds=30,
            webhook_retry_max_backoff_seconds=900,
        ),
    )
    monkeypatch.setattr("app.routes.integrations.retry_webhook_delivery", _fake_retry)

    try:
        asyncio.run(retry_delivery(_request("/api/integrations/deliveries/999/retry"), "999"))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "delivery_not_found"
    else:
        assert False, "expected HTTPException"


def test_retry_delivery_sends_dead_letter_alert(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_retry(**_kwargs):
        return {"status": "dead_letter", "error_message": "max_retries_exceeded:http_500"}

    called: dict[str, object] = {}

    async def _fake_alert(**kwargs):
        called.update(kwargs)
        return True

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.integrations.get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-key",
            webhook_retry_max_retries=5,
            webhook_retry_base_backoff_seconds=30,
            webhook_retry_max_backoff_seconds=900,
            dead_letter_alert_webhook_url="https://hooks.example/abc",
            dead_letter_alert_min_count=1,
        ),
    )
    monkeypatch.setattr("app.routes.integrations.retry_webhook_delivery", _fake_retry)
    monkeypatch.setattr("app.routes.integrations.send_dead_letter_alert", _fake_alert)

    out = asyncio.run(retry_delivery(_request("/api/integrations/deliveries/42/retry"), "42"))
    assert out["ok"] is True
    assert str(out["result"].get("status")) == "dead_letter"
    assert called.get("source") == "manual_retry"
    assert called.get("dead_lettered") == 1


def test_list_webhooks_applies_org_scope(monkeypatch):
    class _Query:
        def __init__(self, client, table_name: str):
            self.client = client
            self.table_name = table_name
            self.ops: list[tuple[str, str, object]] = []

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, field: str, value):
            self.ops.append(("eq", field, value))
            return self

        def in_(self, field: str, value):
            self.ops.append(("in", field, value))
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            self.client.query_logs.append((self.table_name, list(self.ops)))
            if self.table_name == "org_memberships":
                return SimpleNamespace(data=[{"user_id": "user-1"}, {"user_id": "user-2"}])
            if self.table_name == "webhook_subscriptions":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def __init__(self):
            self.query_logs: list[tuple[str, list[tuple[str, str, object]]]] = []

        def table(self, name: str):
            return _Query(self, name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-1", role=Role.ADMIN, org_ids={1}, team_ids={11})

    client = _Client()
    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: client)
    monkeypatch.setattr("app.routes.integrations.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    out = asyncio.run(list_webhooks(_request("/api/integrations/webhooks", "GET"), organization_id=1))
    assert out["count"] == 0
    webhook_logs = [row for row in client.query_logs if row[0] == "webhook_subscriptions"]
    assert webhook_logs
    flat_ops = [op for _, ops in webhook_logs for op in ops]
    assert any(op[0] == "in" and op[1] == "user_id" for op in flat_ops)


def test_list_deliveries_member_team_scope_forbidden(monkeypatch):
    class _Client:
        def table(self, _name: str):
            return SimpleNamespace(select=lambda *_args, **_kwargs: self)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-1", role=Role.MEMBER, org_ids={1}, team_ids={11})

    monkeypatch.setattr("app.routes.integrations.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.integrations.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.integrations.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.integrations.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(list_deliveries(_request("/api/integrations/deliveries", "GET"), team_id=22))
    except HTTPException as exc:
        assert exc.status_code == 403
        assert isinstance(exc.detail, dict)
        assert exc.detail.get("reason") == "team_scope_forbidden"
    else:
        assert False, "expected HTTPException"
