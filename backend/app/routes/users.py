from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.authz import Role, get_authz_context, require_min_role
from app.core.config import get_settings

router = APIRouter(prefix="/api/users/me", tags=["users"])

_ALLOWED_MEMBER_ROLES = {"owner", "admin", "member"}
_ALLOWED_REQUEST_TYPES = {"permission_request", "change_request"}


class UserRequestCreateRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    request_type: str = Field(min_length=1, max_length=40)
    requested_role: str | None = Field(default=None, max_length=40)
    reason: str | None = Field(default=None, max_length=400)


class UserRequestCancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=400)


def _org_member_role(*, supabase, user_id: str, organization_id: str | int) -> str | None:
    rows = (
        supabase.table("org_memberships")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        return None
    return str(rows[0].get("role") or "").strip().lower() or None


def _normalize_request_type(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "role_change":
        normalized = "change_request"
    if normalized not in _ALLOWED_REQUEST_TYPES:
        raise HTTPException(status_code=400, detail="invalid_request_type")
    return normalized


def _normalize_requested_role(*, request_type: str, requested_role: str | None) -> str:
    if request_type == "permission_request":
        role = str(requested_role or "admin").strip().lower()
    else:
        role = str(requested_role or "").strip().lower()
    if role not in _ALLOWED_MEMBER_ROLES:
        raise HTTPException(status_code=400, detail="invalid_member_role")
    return role


def _serialize_row(row: dict[str, Any], org_name_map: dict[int, str]) -> dict[str, Any]:
    organization_id = int(row.get("organization_id") or 0)
    request_type = str(row.get("request_type") or "change_request").strip().lower()
    if request_type not in _ALLOWED_REQUEST_TYPES:
        request_type = "change_request"
    return {
        "id": row.get("id"),
        "organization_id": organization_id,
        "organization_name": org_name_map.get(organization_id),
        "request_type": request_type,
        "target_user_id": row.get("target_user_id"),
        "requested_role": row.get("requested_role"),
        "reason": row.get("reason"),
        "review_reason": row.get("review_reason"),
        "status": row.get("status"),
        "requested_by": row.get("requested_by"),
        "reviewed_by": row.get("reviewed_by"),
        "reviewed_at": row.get("reviewed_at"),
        "cancelled_by": row.get("cancelled_by"),
        "cancelled_at": row.get("cancelled_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/requests")
async def list_my_requests(request: Request, status: str | None = Query(default=None), request_type: str | None = Query(default=None)):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    query = (
        supabase.table("org_role_change_requests")
        .select(
            "id,organization_id,target_user_id,requested_role,reason,request_type,status,requested_by,"
            "reviewed_by,reviewed_at,review_reason,cancelled_by,cancelled_at,created_at,updated_at"
        )
        .eq("requested_by", user_id)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", str(status).strip().lower())
    if request_type:
        normalized_type = _normalize_request_type(request_type)
        query = query.eq("request_type", normalized_type)

    rows = query.execute().data or []

    org_ids = sorted({int(item.get("organization_id") or 0) for item in rows if int(item.get("organization_id") or 0) > 0})
    org_name_map: dict[int, str] = {}
    if org_ids:
        org_rows = (
            supabase.table("organizations")
            .select("id,name")
            .in_("id", org_ids)
            .execute()
        ).data or []
        org_name_map = {int(item.get("id")): str(item.get("name") or "") for item in org_rows if item.get("id") is not None}

    items = [_serialize_row(row, org_name_map) for row in rows]
    return {"items": items, "count": len(items)}


@router.get("/requests/{request_id}")
async def get_my_request(request: Request, request_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    rows = (
        supabase.table("org_role_change_requests")
        .select(
            "id,organization_id,target_user_id,requested_role,reason,request_type,status,requested_by,"
            "reviewed_by,reviewed_at,review_reason,cancelled_by,cancelled_at,created_at,updated_at"
        )
        .eq("id", request_id)
        .eq("requested_by", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="request_not_found")

    row = rows[0]
    org_id = int(row.get("organization_id") or 0)
    org_name_map: dict[int, str] = {}
    if org_id > 0:
        org_rows = supabase.table("organizations").select("id,name").eq("id", org_id).limit(1).execute().data or []
        if org_rows:
            org_name_map[org_id] = str(org_rows[0].get("name") or "")

    return {"item": _serialize_row(row, org_name_map)}


@router.post("/requests")
async def create_my_request(request: Request, body: UserRequestCreateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    organization_id = str(body.organization_id or "").strip()
    if not organization_id.isdigit():
        raise HTTPException(status_code=400, detail="invalid_organization_id")
    requester_role = _org_member_role(supabase=supabase, user_id=user_id, organization_id=organization_id)
    if requester_role not in {"owner", "admin", "member"}:
        raise HTTPException(status_code=404, detail="organization_not_found")

    normalized_request_type = _normalize_request_type(body.request_type)
    normalized_requested_role = _normalize_requested_role(request_type=normalized_request_type, requested_role=body.requested_role)
    if normalized_requested_role == "owner" and requester_role != "owner":
        raise HTTPException(status_code=403, detail="owner_role_request_forbidden")

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "organization_id": organization_id,
        "target_user_id": user_id,
        "requested_role": normalized_requested_role,
        "reason": (body.reason or "").strip() or None,
        "request_type": normalized_request_type,
        "status": "pending",
        "requested_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    rows = supabase.table("org_role_change_requests").insert(payload).execute().data or []
    item = rows[0] if rows else payload

    org_rows = supabase.table("organizations").select("id,name").eq("id", organization_id).limit(1).execute().data or []
    org_name_map = {int(org_rows[0].get("id")): str(org_rows[0].get("name") or "")} if org_rows and org_rows[0].get("id") else {}
    return {"item": _serialize_row(item, org_name_map)}


@router.post("/requests/{request_id}/cancel")
async def cancel_my_request(request: Request, request_id: str, body: UserRequestCancelRequest | None = None):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)

    rows = (
        supabase.table("org_role_change_requests")
        .select("id,status")
        .eq("id", request_id)
        .eq("requested_by", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="request_not_found")
    current_status = str(rows[0].get("status") or "").strip().lower()
    if current_status != "pending":
        raise HTTPException(status_code=409, detail="request_not_cancellable")

    now = datetime.now(timezone.utc).isoformat()
    update_payload: dict[str, Any] = {
        "status": "cancelled",
        "cancelled_by": user_id,
        "cancelled_at": now,
        "updated_at": now,
    }
    cancel_reason = (body.reason or "").strip() if isinstance(body, UserRequestCancelRequest) else ""
    if cancel_reason:
        update_payload["review_reason"] = cancel_reason
    supabase.table("org_role_change_requests").update(update_payload).eq("id", request_id).eq("requested_by", user_id).execute()
    return {"ok": True, "status": "cancelled"}
