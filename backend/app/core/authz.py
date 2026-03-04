from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from fastapi import HTTPException, Request
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.config import get_settings


class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class Scope(str, Enum):
    SELF = "self"
    TEAM = "team"
    ORG = "org"
    GLOBAL = "global"


@dataclass
class AuthzContext:
    user_id: str
    role: Role
    org_ids: set[int]
    team_ids: set[int]


_ROLE_ORDER: dict[Role, int] = {
    Role.MEMBER: 10,
    Role.ADMIN: 20,
    Role.OWNER: 30,
}


def _is_write_method(method: str | None) -> bool:
    if not method:
        return True
    return str(method).upper() not in {"GET", "HEAD", "OPTIONS"}


def _guard_flags() -> tuple[bool, bool]:
    try:
        settings = get_settings()
    except Exception:
        return True, True
    return bool(settings.rbac_read_guard_enabled), bool(settings.rbac_write_guard_enabled)


def require_min_role(ctx: AuthzContext, min_role: Role, *, method: str | None = None) -> None:
    read_enabled, write_enabled = _guard_flags()
    if _is_write_method(method):
        if not write_enabled:
            return
    else:
        if not read_enabled:
            return
    if _ROLE_ORDER.get(ctx.role, 0) < _ROLE_ORDER.get(min_role, 0):
        raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "insufficient_role"})


def require_role(ctx: AuthzContext, min_role: Role, *, method: str | None = None) -> None:
    require_min_role(ctx, min_role, method=method)


def require_scope(
    ctx: AuthzContext,
    *,
    allowed_scopes: set[Scope],
    method: str | None = None,
    team_id: int | None = None,
    organization_id: int | None = None,
    target_user_id: str | None = None,
) -> None:
    read_enabled, write_enabled = _guard_flags()
    if _is_write_method(method):
        if not write_enabled:
            return
    else:
        if not read_enabled:
            return
    # Owner bypass for scope checks; owner-only should still be enforced by require_role.
    if ctx.role == Role.OWNER:
        return
    if Scope.SELF in allowed_scopes and target_user_id and str(target_user_id) == ctx.user_id:
        return
    if Scope.TEAM in allowed_scopes and team_id is not None and int(team_id) in ctx.team_ids:
        return
    if Scope.ORG in allowed_scopes and organization_id is not None and int(organization_id) in ctx.org_ids:
        return
    raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})


def build_data_scope_filter(ctx: AuthzContext, resource: str) -> dict[str, object]:
    name = str(resource or "").strip().lower()
    if name == "audit_events":
        return {"mode": "self_only", "user_id": ctx.user_id}
    if name == "tool_calls":
        return {"mode": "self_or_team", "user_id": ctx.user_id, "team_ids": sorted(ctx.team_ids)}
    if name == "integrations":
        return {"mode": "team_or_org", "team_ids": sorted(ctx.team_ids), "org_ids": sorted(ctx.org_ids)}
    return {"mode": "self_only", "user_id": ctx.user_id}


def _normalize_role(value: object) -> str:
    return str(value or "").strip().lower()


def _resolve_role(*, org_roles: list[str], team_roles: list[str]) -> Role:
    if any(role == "owner" for role in org_roles):
        return Role.OWNER
    if any(role in {"admin", "owner"} for role in org_roles + team_roles):
        return Role.ADMIN
    return Role.MEMBER


async def get_authz_context(
    request: Request,
    *,
    user_id: str | None = None,
    supabase=None,
) -> AuthzContext:
    cached = getattr(request.state, "authz_context", None)
    if isinstance(cached, AuthzContext):
        return cached

    resolved_user_id = user_id or await get_authenticated_user_id(request)
    if supabase is None:
        settings = get_settings()
        supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    org_ids: set[int] = set()
    team_ids: set[int] = set()
    org_roles: list[str] = []
    team_roles: list[str] = []

    try:
        org_rows = (
            supabase.table("org_memberships")
            .select("organization_id,role")
            .eq("user_id", resolved_user_id)
            .execute()
        ).data or []
        for row in org_rows:
            org_id = row.get("organization_id")
            if org_id is not None:
                try:
                    org_ids.add(int(org_id))
                except (TypeError, ValueError):
                    pass
            org_roles.append(_normalize_role(row.get("role")))
    except Exception:
        org_rows = []

    try:
        team_rows = (
            supabase.table("team_memberships")
            .select("team_id,role")
            .eq("user_id", resolved_user_id)
            .execute()
        ).data or []
        for row in team_rows:
            team_id = row.get("team_id")
            if team_id is not None:
                try:
                    team_ids.add(int(team_id))
                except (TypeError, ValueError):
                    pass
            team_roles.append(_normalize_role(row.get("role")))
    except Exception:
        team_rows = []

    role = _resolve_role(org_roles=org_roles, team_roles=team_roles)
    ctx = AuthzContext(user_id=resolved_user_id, role=role, org_ids=org_ids, team_ids=team_ids)
    request.state.authz_context = ctx
    return ctx
