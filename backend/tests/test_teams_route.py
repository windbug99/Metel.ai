import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.teams import (
    TeamMemberRequest,
    TeamUpdateRequest,
    _enforce_team_policy_baseline,
    add_team_member,
    delete_team,
    delete_team_member,
    update_team,
)


def _request(path: str, method: str = "DELETE") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


@pytest.fixture(autouse=True)
def _default_authz_admin(monkeypatch):
    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-1", role=Role.ADMIN, org_ids={1}, team_ids={1})

    monkeypatch.setattr("app.routes.teams.get_authz_context", _fake_authz)


def test_delete_team_member_success(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._mode = "select"

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def delete(self):
            self._mode = "delete"
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self._mode == "delete":
                return SimpleNamespace(data=[])
            if self.table_name == "teams":
                return SimpleNamespace(data=[{"id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"id": 10}])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    out = asyncio.run(delete_team_member(_request("/api/teams/1/members/10"), "1", "10"))
    assert out["ok"] is True


def test_delete_team_member_not_found(monkeypatch):
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
                return SimpleNamespace(data=[{"id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(delete_team_member(_request("/api/teams/1/members/99"), "1", "99"))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "team_member_not_found"
    else:
        assert False, "expected HTTPException"


def test_update_team_policy_rejects_weaker_than_org_baseline(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._mode = "select"

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def update(self, *_args, **_kwargs):
            self._mode = "update"
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams":
                return SimpleNamespace(data=[{"id": 1, "organization_id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"id": 10}])
            if self.table_name == "org_policies":
                return SimpleNamespace(data=[{"policy_json": {"allow_high_risk": False}}])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    try:
        asyncio.run(
            update_team(
                _request("/api/teams/1", "PATCH"),
                "1",
                TeamUpdateRequest(policy_json={"allow_high_risk": True}),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 422
        assert isinstance(exc.detail, dict)
        assert exc.detail.get("code") == "policy_baseline_violation"
    else:
        assert False, "expected HTTPException"


def test_team_policy_baseline_allows_missing_allow_high_risk_when_baseline_false():
    # Missing allow_high_risk is equivalent to non-escalation and should be accepted.
    _enforce_team_policy_baseline(
        baseline={"allow_high_risk": False},
        candidate={},
    )


def test_update_team_policy_allows_service_permitted_by_org_oauth_policy(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._mode = "select"

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def update(self, *_args, **_kwargs):
            self._mode = "update"
            return self

        def insert(self, *_args, **_kwargs):
            self._mode = "insert"
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams":
                return SimpleNamespace(data=[{"id": 1, "organization_id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"id": 10}])
            if self.table_name == "org_policies":
                return SimpleNamespace(data=[{"policy_json": {"allowed_services": ["notion", "linear"]}}])
            if self.table_name == "org_oauth_policies":
                return SimpleNamespace(data=[{"policy_json": {"allowed_providers": ["notion", "linear", "github"]}}])
            if self.table_name in {"team_policies", "policy_revisions"}:
                return SimpleNamespace(data=[{"id": 1}])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    out = asyncio.run(
        update_team(
            _request("/api/teams/1", "PATCH"),
            "1",
            TeamUpdateRequest(policy_json={"allowed_services": ["notion", "linear", "github"]}),
        )
    )
    assert out["ok"] is True


def test_add_team_member_resolves_email_to_user_id(monkeypatch):
    class _Query:
        def __init__(self, client, table_name: str):
            self.client = client
            self.table_name = table_name
            self._mode = "select"
            self._eq_calls: list[tuple[str, object]] = []
            self._payload = None

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def upsert(self, payload: dict, **_kwargs):
            self._mode = "upsert"
            self._payload = payload
            return self

        def eq(self, key: str, value):
            self._eq_calls.append((key, value))
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams":
                return SimpleNamespace(data=[{"id": 1, "organization_id": 1}])
            if self.table_name == "team_memberships":
                if self._mode == "upsert":
                    self.client.last_upsert_payload = dict(self._payload or {})
                    return SimpleNamespace(data=[self._payload])
                return SimpleNamespace(data=[{"id": 10}])
            if self.table_name == "users":
                if ("email", "member@example.com") in self._eq_calls:
                    return SimpleNamespace(data=[{"id": "00000000-0000-0000-0000-000000000999"}])
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def __init__(self):
            self.last_upsert_payload = None

        def table(self, name: str):
            return _Query(self, name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    client = _Client()
    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: client)
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    out = asyncio.run(
        add_team_member(
            _request("/api/teams/1/members", "POST"),
            "1",
            TeamMemberRequest(user_id="member@example.com", role="member"),
        )
    )
    assert out["item"]["user_id"] == "00000000-0000-0000-0000-000000000999"
    assert client.last_upsert_payload is not None
    assert client.last_upsert_payload.get("user_id") == "00000000-0000-0000-0000-000000000999"


def test_add_team_member_email_not_found(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._mode = "select"

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams":
                return SimpleNamespace(data=[{"id": 1, "organization_id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"id": 10}])
            if self.table_name == "users":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            add_team_member(
                _request("/api/teams/1/members", "POST"),
                "1",
                TeamMemberRequest(user_id="not-found@example.com", role="member"),
            )
        )
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "member_user_not_found"


def test_delete_team_success(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._mode = "select"

        def select(self, *_args, **_kwargs):
            self._mode = "select"
            return self

        def update(self, *_args, **_kwargs):
            self._mode = "update"
            return self

        def delete(self):
            self._mode = "delete"
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "teams" and self._mode == "select":
                return SimpleNamespace(data=[{"id": 1, "organization_id": 1}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"id": 10}])
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    out = asyncio.run(delete_team(_request("/api/teams/1", "DELETE"), "1"))
    assert out["ok"] is True


def test_delete_team_not_found(monkeypatch):
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
            return SimpleNamespace(data=[])

    class _Client:
        def table(self, name: str):
            return _Query(name)

    async def _fake_user(_request: Request) -> str:
        return "user-1"

    monkeypatch.setattr("app.routes.teams.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.teams.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.teams.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(delete_team(_request("/api/teams/999", "DELETE"), "999"))
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "team_not_found"
