import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role, get_authz_context, require_min_role


def _request() -> Request:
    scope = {"type": "http", "method": "GET", "path": "/api/tool-calls", "headers": []}
    return Request(scope)


def test_require_min_role_allows_admin_for_member_requirement():
    ctx = AuthzContext(user_id="user-1", role=Role.ADMIN, org_ids=set(), team_ids=set())
    require_min_role(ctx, Role.MEMBER)


def test_require_min_role_blocks_member_for_admin_requirement():
    ctx = AuthzContext(user_id="user-1", role=Role.MEMBER, org_ids=set(), team_ids=set())
    try:
        require_min_role(ctx, Role.ADMIN)
    except HTTPException as exc:
        assert exc.status_code == 403
        assert isinstance(exc.detail, dict)
        assert exc.detail.get("code") == "access_denied"
        assert exc.detail.get("reason") == "insufficient_role"
    else:
        assert False, "expected HTTPException"


def test_require_min_role_respects_read_guard_toggle(monkeypatch):
    monkeypatch.setattr(
        "app.core.authz.get_settings",
        lambda: SimpleNamespace(rbac_read_guard_enabled=False, rbac_write_guard_enabled=True),
    )
    ctx = AuthzContext(user_id="user-1", role=Role.MEMBER, org_ids=set(), team_ids=set())
    require_min_role(ctx, Role.ADMIN, method="GET")


def test_require_min_role_respects_write_guard_toggle(monkeypatch):
    monkeypatch.setattr(
        "app.core.authz.get_settings",
        lambda: SimpleNamespace(rbac_read_guard_enabled=True, rbac_write_guard_enabled=False),
    )
    ctx = AuthzContext(user_id="user-1", role=Role.MEMBER, org_ids=set(), team_ids=set())
    require_min_role(ctx, Role.ADMIN, method="POST")


def test_get_authz_context_resolves_owner_and_caches_on_request():
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._user_id = None

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, field: str, value):
            if field == "user_id":
                self._user_id = value
            return self

        def execute(self):
            if self.table_name == "org_memberships":
                return SimpleNamespace(data=[{"organization_id": 101, "role": "owner"}])
            if self.table_name == "team_memberships":
                return SimpleNamespace(data=[{"team_id": 55, "role": "member"}])
            return SimpleNamespace(data=[])

    class _Client:
        def __init__(self):
            self.calls = 0

        def table(self, name: str):
            self.calls += 1
            return _Query(name)

    client = _Client()
    request = _request()

    first = asyncio.run(get_authz_context(request, user_id="user-1", supabase=client))
    second = asyncio.run(get_authz_context(request, user_id="user-1", supabase=client))

    assert first.role == Role.OWNER
    assert first.user_id == "user-1"
    assert first.org_ids == {101}
    assert first.team_ids == {55}
    assert first is second
    assert client.calls == 2
