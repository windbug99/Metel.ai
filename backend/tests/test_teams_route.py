import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.teams import TeamUpdateRequest, delete_team_member, update_team


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
