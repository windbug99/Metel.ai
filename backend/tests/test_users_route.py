import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.users import (
    UserRequestCreateRequest,
    UserRequestCancelRequest,
    UserSecurityUpdateRequest,
    cancel_my_request,
    create_my_request,
    get_my_security,
    get_my_request,
    list_my_requests,
    update_my_security,
)


def _request(path: str = "/api/users/me/requests", method: str = "GET") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


@pytest.fixture(autouse=True)
def _default_authz(monkeypatch):
    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="member-user", role=Role.MEMBER, org_ids={1}, team_ids={1})

    monkeypatch.setattr("app.routes.users.get_authz_context", _fake_authz)


class _Query:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.mode = "select"
        self.payload = None
        self.eq_calls: list[tuple[str, object]] = []
        self.in_calls: list[tuple[str, object]] = []

    def select(self, *_args, **_kwargs):
        self.mode = "select"
        return self

    def insert(self, payload: dict):
        self.mode = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict):
        self.mode = "update"
        self.payload = payload
        return self

    def upsert(self, payload: dict, **_kwargs):
        self.mode = "upsert"
        self.payload = payload
        return self

    def eq(self, key: str, value):
        self.eq_calls.append((key, value))
        return self

    def in_(self, key: str, values):
        self.in_calls.append((key, values))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.mode == "select" and self.table_name == "org_memberships":
            return SimpleNamespace(data=[{"role": "member"}])
        if self.mode == "select" and self.table_name == "user_security_settings":
            if ("user_id", "member-user") in self.eq_calls and self.client.security_select_mode == "existing":
                return SimpleNamespace(
                    data=[
                        {
                            "user_id": "member-user",
                            "mfa_enabled": True,
                            "session_timeout_minutes": 45,
                            "password_rotation_days": 60,
                            "updated_at": "2026-03-08T01:00:00+00:00",
                        }
                    ]
                )
            return SimpleNamespace(data=[])
        if self.mode == "insert" and self.table_name == "org_role_change_requests":
            payload = dict(self.payload or {})
            payload["id"] = 10
            return SimpleNamespace(data=[payload])
        if self.mode == "upsert" and self.table_name == "user_security_settings":
            self.client.security_upsert_payload = dict(self.payload or {})
            return SimpleNamespace(data=[self.payload])
        if self.mode == "select" and self.table_name == "organizations":
            if self.eq_calls:
                return SimpleNamespace(data=[{"id": 1, "name": "Acme"}])
            return SimpleNamespace(data=[{"id": 1, "name": "Acme"}])
        if self.mode == "select" and self.table_name == "org_role_change_requests":
            if ("id", "99") in self.eq_calls:
                return SimpleNamespace(data=[])
            if any(key == "id" for key, _ in self.eq_calls):
                return SimpleNamespace(
                    data=[
                        {
                            "id": 12,
                            "organization_id": 1,
                            "target_user_id": "member-user",
                            "requested_role": "admin",
                            "reason": "need access",
                            "request_type": "permission_request",
                            "status": "pending",
                            "requested_by": "member-user",
                            "reviewed_by": None,
                            "reviewed_at": None,
                            "review_reason": None,
                            "cancelled_by": None,
                            "cancelled_at": None,
                            "created_at": "2026-03-08T00:00:00+00:00",
                            "updated_at": "2026-03-08T00:00:00+00:00",
                        }
                    ]
                )
            return SimpleNamespace(
                data=[
                    {
                        "id": 11,
                        "organization_id": 1,
                        "target_user_id": "member-user",
                        "requested_role": "admin",
                        "reason": "need admin",
                        "request_type": "permission_request",
                        "status": "pending",
                        "requested_by": "member-user",
                        "reviewed_by": None,
                        "reviewed_at": None,
                        "review_reason": None,
                        "cancelled_by": None,
                        "cancelled_at": None,
                        "created_at": "2026-03-07T00:00:00+00:00",
                        "updated_at": "2026-03-07T00:00:00+00:00",
                    }
                ]
            )
        return SimpleNamespace(data=[])


class _Client:
    def __init__(self):
        self.updated_payload = None
        self.security_upsert_payload = None
        self.security_select_mode = "default"

    def table(self, name: str):
        query = _Query(self, name)
        original_execute = query.execute

        def _execute_with_capture():
            if query.mode == "update" and query.table_name == "org_role_change_requests":
                self.updated_payload = dict(query.payload or {})
                return SimpleNamespace(data=[{"id": 12}])
            return original_execute()

        query.execute = _execute_with_capture
        return query


@pytest.fixture
def _client(monkeypatch):
    client = _Client()

    async def _fake_user(_request: Request) -> str:
        return "member-user"

    monkeypatch.setattr("app.routes.users.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.users.create_client", lambda *_args, **_kwargs: client)
    monkeypatch.setattr("app.routes.users.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))
    return client


def test_list_my_requests(_client):
    out = asyncio.run(list_my_requests(_request(), status="pending", request_type="permission_request"))
    assert out["count"] == 1
    assert out["items"][0]["organization_name"] == "Acme"
    assert out["items"][0]["request_type"] == "permission_request"


def test_create_my_request_defaults_admin_role(_client):
    out = asyncio.run(
        create_my_request(
            _request(method="POST"),
            UserRequestCreateRequest(organization_id="1", request_type="permission_request", requested_role=None, reason="Need admin"),
        )
    )
    assert out["item"]["requested_role"] == "admin"
    assert out["item"]["status"] == "pending"


def test_get_my_request_not_found(_client):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_my_request(_request("/api/users/me/requests/99"), "99"))
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "request_not_found"


def test_cancel_my_request_updates_status(_client):
    out = asyncio.run(
        cancel_my_request(
            _request("/api/users/me/requests/12/cancel", "POST"),
            "12",
            UserRequestCancelRequest(reason="No longer needed"),
        )
    )
    assert out["status"] == "cancelled"
    assert _client.updated_payload is not None
    assert _client.updated_payload.get("status") == "cancelled"
    assert _client.updated_payload.get("review_reason") == "No longer needed"


def test_get_my_security_defaults(_client):
    out = asyncio.run(get_my_security(_request("/api/users/me/security")))
    assert out["user_id"] == "member-user"
    assert out["mfa_enabled"] is False
    assert out["session_timeout_minutes"] == 60
    assert out["password_rotation_days"] == 90


def test_get_my_security_existing_row(_client):
    _client.security_select_mode = "existing"
    out = asyncio.run(get_my_security(_request("/api/users/me/security")))
    assert out["mfa_enabled"] is True
    assert out["session_timeout_minutes"] == 45
    assert out["password_rotation_days"] == 60


def test_update_my_security_upsert(_client):
    out = asyncio.run(
        update_my_security(
            _request("/api/users/me/security", "PATCH"),
            UserSecurityUpdateRequest(mfa_enabled=True, session_timeout_minutes=30, password_rotation_days=120),
        )
    )
    assert out["mfa_enabled"] is True
    assert out["session_timeout_minutes"] == 30
    assert out["password_rotation_days"] == 120
    assert _client.security_upsert_payload is not None
