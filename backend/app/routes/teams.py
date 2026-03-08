from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.authz import AuthzContext, Role, get_authz_context, require_min_role
from app.core.config import get_settings

router = APIRouter(prefix="/api/teams", tags=["teams"])


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    policy_json: dict[str, Any] | None = None
    organization_id: int | None = None


class TeamUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    policy_json: dict[str, Any] | None = None


class TeamMemberRequest(BaseModel):
    user_id: str = Field(min_length=1)
    role: str = Field(default="member", min_length=1, max_length=40)


def _normalize_policy(raw: dict[str, Any] | None) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="invalid_policy_json")
    out: dict[str, Any] = {}
    allow_high_risk = raw.get("allow_high_risk")
    if allow_high_risk is not None:
        out["allow_high_risk"] = bool(allow_high_risk)
    allowed_services = raw.get("allowed_services")
    if isinstance(allowed_services, list):
        out["allowed_services"] = [str(item).strip().lower() for item in allowed_services if str(item).strip()]
    deny_tools = raw.get("deny_tools")
    if isinstance(deny_tools, list):
        out["deny_tools"] = [str(item).strip() for item in deny_tools if str(item).strip()]
    allowed_linear_team_ids = raw.get("allowed_linear_team_ids")
    if isinstance(allowed_linear_team_ids, list):
        out["allowed_linear_team_ids"] = [str(item).strip() for item in allowed_linear_team_ids if str(item).strip()]
    return out


def _insert_policy_revision(*, supabase, team_id: int | str, user_id: str, source: str, policy_json: dict[str, Any]) -> None:
    supabase.table("policy_revisions").insert(
        {
            "team_id": team_id,
            "source": source,
            "policy_json": policy_json,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def _load_org_policy_baseline(*, supabase, organization_id: int | None) -> dict[str, Any]:
    if organization_id is None:
        return {}
    try:
        rows = (
            supabase.table("org_policies")
            .select("policy_json")
            .eq("organization_id", organization_id)
            .limit(1)
            .execute()
        ).data or []
    except Exception:
        # Backward compatibility: table may not exist on older environments.
        return {}
    if not rows:
        return {}
    raw = rows[0].get("policy_json")
    return _normalize_policy(raw if isinstance(raw, dict) else None)


def _enforce_team_policy_baseline(*, baseline: dict[str, Any], candidate: dict[str, Any]) -> None:
    violations: list[str] = []

    baseline_allow_high_risk = baseline.get("allow_high_risk")
    if baseline_allow_high_risk is False and candidate.get("allow_high_risk") is not False:
        violations.append("allow_high_risk")

    baseline_allowed_services = baseline.get("allowed_services")
    if isinstance(baseline_allowed_services, list):
        candidate_allowed_services = candidate.get("allowed_services")
        if not isinstance(candidate_allowed_services, list):
            violations.append("allowed_services")
        else:
            base_set = set(str(item) for item in baseline_allowed_services)
            candidate_set = set(str(item) for item in candidate_allowed_services)
            if not candidate_set.issubset(base_set):
                violations.append("allowed_services")

    baseline_allowed_linear_team_ids = baseline.get("allowed_linear_team_ids")
    if isinstance(baseline_allowed_linear_team_ids, list):
        candidate_allowed_linear_team_ids = candidate.get("allowed_linear_team_ids")
        if not isinstance(candidate_allowed_linear_team_ids, list):
            violations.append("allowed_linear_team_ids")
        else:
            base_set = set(str(item) for item in baseline_allowed_linear_team_ids)
            candidate_set = set(str(item) for item in candidate_allowed_linear_team_ids)
            if not candidate_set.issubset(base_set):
                violations.append("allowed_linear_team_ids")

    baseline_deny_tools = baseline.get("deny_tools")
    if isinstance(baseline_deny_tools, list):
        candidate_deny_tools = candidate.get("deny_tools")
        if not isinstance(candidate_deny_tools, list):
            violations.append("deny_tools")
        else:
            base_set = set(str(item) for item in baseline_deny_tools)
            candidate_set = set(str(item) for item in candidate_deny_tools)
            if not base_set.issubset(candidate_set):
                violations.append("deny_tools")

    if violations:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "policy_baseline_violation",
                "reason": "team_policy_cannot_weaken_organization_baseline",
                "fields": sorted(set(violations)),
            },
        )


def _resolve_organization_id(*, authz_ctx: AuthzContext, requested_organization_id: int | None) -> int:
    if requested_organization_id is not None:
        if requested_organization_id not in authz_ctx.org_ids:
            raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})
        return requested_organization_id
    if len(authz_ctx.org_ids) == 1:
        return next(iter(authz_ctx.org_ids))
    raise HTTPException(status_code=400, detail="organization_id_required")


def _load_team(*, supabase, team_id: str | int) -> dict[str, Any] | None:
    rows = (
        supabase.table("teams")
        .select("id,organization_id,name,description,is_active,created_at,updated_at")
        .eq("id", team_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def _is_team_member(*, supabase, team_id: str | int, user_id: str) -> bool:
    rows = (
        supabase.table("team_memberships")
        .select("id")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    return bool(rows)


def _require_team_access(*, supabase, authz_ctx: AuthzContext, team_id: str, write: bool) -> dict[str, Any]:
    team = _load_team(supabase=supabase, team_id=team_id)
    if not team:
        raise HTTPException(status_code=404, detail="team_not_found")

    org_id_raw = team.get("organization_id")
    try:
        org_id = int(org_id_raw) if org_id_raw is not None else None
    except (TypeError, ValueError):
        org_id = None

    has_team_membership = _is_team_member(supabase=supabase, team_id=team_id, user_id=authz_ctx.user_id)
    has_org_scope = org_id is not None and org_id in authz_ctx.org_ids
    has_org_admin = has_org_scope and authz_ctx.role in {Role.ADMIN, Role.OWNER}
    legacy_admin_override = write and org_id is None and authz_ctx.role in {Role.ADMIN, Role.OWNER}

    if write:
        allowed = has_team_membership or has_org_admin or legacy_admin_override
    else:
        allowed = has_team_membership or has_org_scope
    if not allowed:
        raise HTTPException(status_code=404, detail="team_not_found")
    return team


@router.get("")
async def list_teams(request: Request, organization_id: int | None = Query(default=None)):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    if organization_id is not None and organization_id not in authz_ctx.org_ids:
        raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "scope_mismatch"})

    membership_rows = (
        supabase.table("team_memberships")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    member_team_ids = [row.get("team_id") for row in membership_rows if row.get("team_id") is not None]

    teams_by_id: dict[str, dict[str, Any]] = {}

    if member_team_ids:
        member_query = (
            supabase.table("teams")
            .select("id,organization_id,name,description,is_active,created_at,updated_at")
            .in_("id", member_team_ids)
        )
        if organization_id is not None:
            member_query = member_query.eq("organization_id", organization_id)
        member_rows = member_query.order("created_at", desc=True).execute().data or []
        for row in member_rows:
            teams_by_id[str(row.get("id"))] = row

    # Org admins/owners can view all teams under scoped organizations.
    if authz_ctx.role in {Role.ADMIN, Role.OWNER}:
        scoped_org_ids = [organization_id] if organization_id is not None else sorted(authz_ctx.org_ids)
        if scoped_org_ids:
            org_rows = (
                supabase.table("teams")
                .select("id,organization_id,name,description,is_active,created_at,updated_at")
                .in_("organization_id", scoped_org_ids)
                .order("created_at", desc=True)
                .execute()
            ).data or []
            for row in org_rows:
                teams_by_id[str(row.get("id"))] = row

    if not teams_by_id:
        return {"items": [], "count": 0}

    team_ids = [row.get("id") for row in teams_by_id.values() if row.get("id") is not None]
    policies = (
        supabase.table("team_policies")
        .select("team_id,policy_json,updated_at")
        .in_("team_id", team_ids)
        .execute()
    ).data or []
    policy_map = {str(item.get("team_id")): item for item in policies}

    items = []
    for team in sorted(teams_by_id.values(), key=lambda row: str(row.get("created_at") or ""), reverse=True):
        policy_row = policy_map.get(str(team.get("id"))) or {}
        items.append(
            {
                **team,
                "policy_json": policy_row.get("policy_json") or {},
                "policy_updated_at": policy_row.get("updated_at"),
            }
        )
    return {"items": items, "count": len(items)}


@router.post("")
async def create_team(request: Request, body: TeamCreateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    organization_id = _resolve_organization_id(authz_ctx=authz_ctx, requested_organization_id=body.organization_id)
    now = datetime.now(timezone.utc).isoformat()
    policy_json = _normalize_policy(body.policy_json)
    org_baseline = _load_org_policy_baseline(supabase=supabase, organization_id=organization_id)
    _enforce_team_policy_baseline(baseline=org_baseline, candidate=policy_json)

    created = (
        supabase.table("teams")
        .insert(
            {
                "organization_id": organization_id,
                "user_id": user_id,
                "name": body.name.strip(),
                "description": (body.description or "").strip() or None,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        )
        .execute()
    ).data or []
    if not created:
        raise HTTPException(status_code=500, detail="team_create_failed")

    team = created[0]
    team_id = team.get("id")
    supabase.table("team_memberships").upsert(
        {
            "team_id": team_id,
            "user_id": user_id,
            "role": "admin",
            "created_at": now,
        },
        on_conflict="team_id,user_id",
    ).execute()
    supabase.table("team_policies").insert({"team_id": team_id, "policy_json": policy_json, "created_at": now, "updated_at": now}).execute()
    _insert_policy_revision(supabase=supabase, team_id=team_id, user_id=user_id, source="team_created", policy_json=policy_json)
    return {
        "id": team_id,
        "organization_id": team.get("organization_id"),
        "name": team.get("name"),
        "policy_json": policy_json,
    }


@router.patch("/{team_id}")
async def update_team(request: Request, team_id: str, body: TeamUpdateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    team = _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=True)

    payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    fields = body.model_fields_set
    if "name" in fields:
        payload["name"] = (body.name or "").strip()
    if "description" in fields:
        payload["description"] = (body.description or "").strip() or None
    if "is_active" in fields and body.is_active is not None:
        payload["is_active"] = bool(body.is_active)
    if len(payload) > 1:
        supabase.table("teams").update(payload).eq("id", team_id).execute()

    if "policy_json" in fields:
        policy_json = _normalize_policy(body.policy_json)
        org_id_raw = team.get("organization_id") if team else None
        try:
            org_id = int(org_id_raw) if org_id_raw is not None else None
        except (TypeError, ValueError):
            org_id = None
        org_baseline = _load_org_policy_baseline(supabase=supabase, organization_id=org_id)
        _enforce_team_policy_baseline(baseline=org_baseline, candidate=policy_json)
        now = datetime.now(timezone.utc).isoformat()
        existing = (
            supabase.table("team_policies")
            .select("id")
            .eq("team_id", team_id)
            .limit(1)
            .execute()
        ).data or []
        if existing:
            supabase.table("team_policies").update({"policy_json": policy_json, "updated_at": now}).eq("team_id", team_id).execute()
        else:
            supabase.table("team_policies").insert({"team_id": team_id, "policy_json": policy_json, "created_at": now, "updated_at": now}).execute()
        _insert_policy_revision(supabase=supabase, team_id=team_id, user_id=user_id, source="team_policy_update", policy_json=policy_json)

    return {"ok": True}


@router.get("/{team_id}/members")
async def list_team_members(request: Request, team_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=False)

    rows = (
        supabase.table("team_memberships")
        .select("id,user_id,role,created_at")
        .eq("team_id", team_id)
        .order("created_at", desc=False)
        .execute()
    ).data or []
    return {"items": rows, "count": len(rows)}


@router.post("/{team_id}/members")
async def add_team_member(request: Request, team_id: str, body: TeamMemberRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=True)

    now = datetime.now(timezone.utc).isoformat()
    row = (
        supabase.table("team_memberships")
        .upsert(
            {"team_id": team_id, "user_id": body.user_id.strip(), "role": body.role.strip(), "created_at": now},
            on_conflict="team_id,user_id",
        )
        .execute()
    ).data or []
    return {"item": row[0] if row else {"team_id": team_id, "user_id": body.user_id.strip(), "role": body.role.strip()}}


@router.delete("/{team_id}/members/{membership_id}")
async def delete_team_member(request: Request, team_id: str, membership_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=True)

    member = (
        supabase.table("team_memberships")
        .select("id")
        .eq("id", membership_id)
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    ).data or []
    if not member:
        raise HTTPException(status_code=404, detail="team_member_not_found")

    supabase.table("team_memberships").delete().eq("id", membership_id).eq("team_id", team_id).execute()
    return {"ok": True}


@router.get("/{team_id}/policy-revisions")
async def list_policy_revisions(request: Request, team_id: str, limit: int = 20):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=False)

    rows = (
        supabase.table("policy_revisions")
        .select("id,team_id,source,policy_json,created_by,created_at")
        .eq("team_id", team_id)
        .order("created_at", desc=True)
        .limit(min(max(limit, 1), 100))
        .execute()
    ).data or []
    return {"items": rows, "count": len(rows)}


@router.post("/{team_id}/policy-revisions/{revision_id}/rollback")
async def rollback_policy_revision(request: Request, team_id: str, revision_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)

    _require_team_access(supabase=supabase, authz_ctx=authz_ctx, team_id=team_id, write=True)

    revision = (
        supabase.table("policy_revisions")
        .select("id,policy_json")
        .eq("id", revision_id)
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    ).data or []
    if not revision:
        raise HTTPException(status_code=404, detail="policy_revision_not_found")
    policy_json = revision[0].get("policy_json") if isinstance(revision[0].get("policy_json"), dict) else {}
    now = datetime.now(timezone.utc).isoformat()
    existing = (
        supabase.table("team_policies")
        .select("id")
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    ).data or []
    if existing:
        supabase.table("team_policies").update({"policy_json": policy_json, "updated_at": now}).eq("team_id", team_id).execute()
    else:
        supabase.table("team_policies").insert({"team_id": team_id, "policy_json": policy_json, "created_at": now, "updated_at": now}).execute()
    _insert_policy_revision(supabase=supabase, team_id=team_id, user_id=user_id, source="team_policy_rollback", policy_json=policy_json)
    return {"ok": True, "policy_json": policy_json}
