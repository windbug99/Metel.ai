import asyncio
from types import SimpleNamespace

from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.me import get_my_permissions


def _request(path: str = "/api/me/permissions", method: str = "GET") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


def test_get_my_permissions_owner(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "owner-user"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="owner-user", role=Role.OWNER, org_ids={2, 1}, team_ids={5})

    monkeypatch.setattr("app.routes.me.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.me.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.me.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.me.get_settings",
        lambda: SimpleNamespace(
            supabase_url="x",
            supabase_service_role_key="y",
            rbac_read_guard_enabled=True,
            rbac_write_guard_enabled=True,
            ui_rbac_strict_enabled=True,
        ),
    )

    out = asyncio.run(get_my_permissions(_request()))
    assert out["user_id"] == "owner-user"
    assert out["role"] == "owner"
    assert out["org_ids"] == [1, 2]
    assert out["team_ids"] == [5]
    assert out["permissions"]["can_read_audit_settings"] is True
    assert out["permissions"]["can_update_audit_settings"] is True
    assert out["permissions"]["can_read_admin_ops"] is True
    assert out["permissions"]["can_manage_incident_banner"] is True
    assert out["feature_flags"]["read_guard_enabled"] is True
    assert out["feature_flags"]["write_guard_enabled"] is True
    assert out["feature_flags"]["ui_strict_enabled"] is True


def test_get_my_permissions_member(monkeypatch):
    async def _fake_user(_request: Request) -> str:
        return "member-user"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="member-user", role=Role.MEMBER, org_ids={3}, team_ids={7, 8})

    monkeypatch.setattr("app.routes.me.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.me.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.me.create_client", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(
        "app.routes.me.get_settings",
        lambda: SimpleNamespace(
            supabase_url="x",
            supabase_service_role_key="y",
            rbac_read_guard_enabled=True,
            rbac_write_guard_enabled=False,
            ui_rbac_strict_enabled=False,
        ),
    )

    out = asyncio.run(get_my_permissions(_request()))
    assert out["user_id"] == "member-user"
    assert out["role"] == "member"
    assert out["org_ids"] == [3]
    assert out["team_ids"] == [7, 8]
    assert out["permissions"]["can_read_audit_settings"] is False
    assert out["permissions"]["can_update_audit_settings"] is False
    assert out["permissions"]["can_read_admin_ops"] is False
    assert out["permissions"]["can_manage_incident_banner"] is False
    assert out["permissions"]["can_manage_api_keys"] is True
    assert out["feature_flags"]["read_guard_enabled"] is True
    assert out["feature_flags"]["write_guard_enabled"] is False
    assert out["feature_flags"]["ui_strict_enabled"] is False
