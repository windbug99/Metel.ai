from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.authz import AuthzContext, Role, get_authz_context, require_min_role
from app.core.config import get_settings

router = APIRouter(prefix="/api/agents", tags=["agents"])

_ALLOWED_STATUSES = {"active", "paused", "disabled"}


class AgentCreateRequest(BaseModel):
    team_id: int
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str = Field(default="active", min_length=1, max_length=20)


class AgentUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, min_length=1, max_length=20)
    is_active: bool | None = None


def _normalize_status(value: str | None, *, default: str) -> str:
    status = str(value or default).strip().lower()
    if status not in _ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="invalid_agent_status")
    return status


def _load_team(*, supabase, team_id: int) -> dict[str, Any] | None:
    rows = (
        supabase.table("teams")
        .select("id,organization_id,is_active")
        .eq("id", team_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def _has_team_membership(*, supabase, team_id: int, user_id: str) -> bool:
    rows = (
        supabase.table("team_memberships")
        .select("id")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    return bool(rows)


def _require_agent_scope(*, supabase, authz_ctx: AuthzContext, row: dict[str, Any], write: bool) -> None:
    team_id = row.get("team_id")
    org_id = row.get("organization_id")
    try:
        team_id_int = int(team_id) if team_id is not None else None
    except (TypeError, ValueError):
        team_id_int = None
    try:
        org_id_int = int(org_id) if org_id is not None else None
    except (TypeError, ValueError):
        org_id_int = None

    if write:
        if org_id_int is None or org_id_int not in authz_ctx.org_ids:
            raise HTTPException(status_code=404, detail="agent_not_found")
        return

    is_team_member = team_id_int is not None and _has_team_membership(supabase=supabase, team_id=team_id_int, user_id=authz_ctx.user_id)
    is_org_scoped = org_id_int is not None and org_id_int in authz_ctx.org_ids
    if authz_ctx.role in {Role.ADMIN, Role.OWNER}:
        if not is_org_scoped:
            raise HTTPException(status_code=404, detail="agent_not_found")
        return
    if not is_team_member:
        raise HTTPException(status_code=404, detail="agent_not_found")


@router.get("")
async def list_agents(
    request: Request,
    organization_id: int | None = Query(default=None),
    team_id: int | None = Query(default=None),
    status: str = Query(default=""),
):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    if organization_id is not None and organization_id not in authz_ctx.org_ids:
        raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})
    if team_id is not None and authz_ctx.role == Role.MEMBER and team_id not in authz_ctx.team_ids:
        raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})

    query = supabase.table("agents").select(
        "id,organization_id,team_id,name,description,status,is_active,created_by,created_at,updated_at"
    )

    if status.strip():
        query = query.eq("status", _normalize_status(status, default="active"))
    if organization_id is not None:
        query = query.eq("organization_id", organization_id)
    elif authz_ctx.role in {Role.ADMIN, Role.OWNER}:
        if not authz_ctx.org_ids:
            return {"items": [], "count": 0}
        query = query.in_("organization_id", sorted(authz_ctx.org_ids))

    if team_id is not None:
        query = query.eq("team_id", team_id)
    elif authz_ctx.role == Role.MEMBER:
        if not authz_ctx.team_ids:
            return {"items": [], "count": 0}
        query = query.in_("team_id", sorted(authz_ctx.team_ids))

    rows = query.order("created_at", desc=True).execute().data or []
    return {"items": rows, "count": len(rows)}


@router.get("/{agent_id}")
async def get_agent(request: Request, agent_id: int):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    rows = (
        supabase.table("agents")
        .select("id,organization_id,team_id,name,description,status,is_active,created_by,created_at,updated_at")
        .eq("id", agent_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="agent_not_found")
    item = rows[0]
    _require_agent_scope(supabase=supabase, authz_ctx=authz_ctx, row=item, write=False)
    return {"item": item}


@router.post("")
async def create_agent(request: Request, body: AgentCreateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    team = _load_team(supabase=supabase, team_id=body.team_id)
    if not team:
        raise HTTPException(status_code=400, detail="invalid_team_id")

    org_id_raw = team.get("organization_id")
    try:
        org_id = int(org_id_raw) if org_id_raw is not None else None
    except (TypeError, ValueError):
        org_id = None
    if org_id is None or org_id not in authz_ctx.org_ids:
        raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "organization_id": org_id,
        "team_id": body.team_id,
        "name": body.name.strip(),
        "description": (body.description or "").strip() or None,
        "status": _normalize_status(body.status, default="active"),
        "is_active": True,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    rows = supabase.table("agents").insert(payload).execute().data or []
    if not rows:
        raise HTTPException(status_code=500, detail="agent_create_failed")
    return {"item": rows[0]}


@router.patch("/{agent_id}")
async def update_agent(request: Request, agent_id: int, body: AgentUpdateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    found = (
        supabase.table("agents")
        .select("id,organization_id,team_id")
        .eq("id", agent_id)
        .limit(1)
        .execute()
    ).data or []
    if not found:
        raise HTTPException(status_code=404, detail="agent_not_found")

    _require_agent_scope(supabase=supabase, authz_ctx=authz_ctx, row=found[0], write=True)

    fields = body.model_fields_set
    payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in fields:
        payload["name"] = (body.name or "").strip()
    if "description" in fields:
        payload["description"] = (body.description or "").strip() or None
    if "status" in fields:
        payload["status"] = _normalize_status(body.status, default="active")
    if "is_active" in fields and body.is_active is not None:
        payload["is_active"] = bool(body.is_active)

    if len(payload) <= 1:
        return {"ok": True, "updated": False}

    rows = (
        supabase.table("agents")
        .update(payload)
        .eq("id", agent_id)
        .execute()
    ).data or []
    return {"ok": True, "updated": True, "item": rows[0] if rows else None}
