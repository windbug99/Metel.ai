from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.authz import Role, get_authz_context, require_min_role
from app.core.config import get_settings
from app.core.dead_letter_alert import send_dead_letter_alert
from app.core.event_hooks import emit_webhook_event, process_pending_webhook_retries, retry_webhook_delivery

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class WebhookCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    endpoint_url: str = Field(min_length=1, max_length=500)
    secret: str | None = Field(default=None, max_length=200)
    event_types: list[str] = Field(default_factory=list)


class WebhookUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    endpoint_url: str | None = Field(default=None, min_length=1, max_length=500)
    secret: str | None = Field(default=None, max_length=200)
    event_types: list[str] | None = None
    is_active: bool | None = None


def _normalize_optional_int(value: int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _resolve_scoped_user_ids(
    *,
    supabase,
    authz_ctx,
    request_user_id: str,
    organization_id: int | None,
    team_id: int | None,
) -> list[str]:
    normalized_organization_id = _normalize_optional_int(organization_id)
    normalized_team_id = _normalize_optional_int(team_id)

    if normalized_organization_id is None and normalized_team_id is None:
        return [request_user_id]

    if normalized_organization_id is not None:
        if authz_ctx.role == Role.MEMBER:
            raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "member_org_scope_forbidden"})
        if normalized_organization_id not in authz_ctx.org_ids:
            raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "organization_scope_forbidden"})

    if normalized_team_id is not None:
        if authz_ctx.role == Role.MEMBER and normalized_team_id not in authz_ctx.team_ids:
            raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "team_scope_forbidden"})

        team_rows = (
            supabase.table("teams")
            .select("id,organization_id")
            .eq("id", normalized_team_id)
            .limit(1)
            .execute()
        ).data or []
        if not team_rows:
            return []

        team_org_raw = team_rows[0].get("organization_id")
        try:
            team_org_id = int(team_org_raw) if team_org_raw is not None else None
        except (TypeError, ValueError):
            team_org_id = None
        if normalized_organization_id is not None and team_org_id != normalized_organization_id:
            raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "team_scope_forbidden"})

        if authz_ctx.role in {Role.ADMIN, Role.OWNER}:
            has_org_scope = team_org_id is not None and team_org_id in authz_ctx.org_ids
            has_team_scope = normalized_team_id in authz_ctx.team_ids
            if not has_org_scope and not has_team_scope:
                raise HTTPException(status_code=403, detail={"code": "access_denied", "reason": "team_scope_forbidden"})

        team_member_rows = (
            supabase.table("team_memberships")
            .select("user_id")
            .eq("team_id", normalized_team_id)
            .execute()
        ).data or []
        team_user_ids = [str(row.get("user_id") or "").strip() for row in team_member_rows if str(row.get("user_id") or "").strip()]
        return sorted(set(team_user_ids))

    org_member_rows = (
        supabase.table("org_memberships")
        .select("user_id")
        .eq("organization_id", normalized_organization_id)
        .execute()
    ).data or []
    org_user_ids = [str(row.get("user_id") or "").strip() for row in org_member_rows if str(row.get("user_id") or "").strip()]
    return sorted(set(org_user_ids)) or [request_user_id]


def _normalize_event_types(raw: list[str] | None) -> list[str]:
    if raw is None:
        return []
    allowed = {
        "tool_called",
        "tool_succeeded",
        "tool_failed",
        "policy_blocked",
        "quota_exceeded",
        "rate_limit_exceeded",
        "*",
    }
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        if value not in allowed:
            raise HTTPException(status_code=400, detail=f"invalid_event_type:{value}")
        seen.add(value)
        out.append(value)
    return out


@router.get("/webhooks")
async def list_webhooks(
    request: Request,
    organization_id: int | None = Query(default=None),
    team_id: int | None = Query(default=None),
):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)
    scoped_user_ids = _resolve_scoped_user_ids(
        supabase=supabase,
        authz_ctx=authz_ctx,
        request_user_id=user_id,
        organization_id=organization_id,
        team_id=team_id,
    )
    if not scoped_user_ids:
        rows = []
    else:
        query = supabase.table("webhook_subscriptions").select(
            "id,name,endpoint_url,event_types,is_active,last_delivery_at,created_at,updated_at"
        )
        if len(scoped_user_ids) == 1:
            query = query.eq("user_id", scoped_user_ids[0])
        else:
            query = query.in_("user_id", scoped_user_ids)
        rows = query.order("created_at", desc=True).execute().data or []
    return {"items": rows, "count": len(rows)}


@router.post("/webhooks")
async def create_webhook(request: Request, body: WebhookCreateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    now = datetime.now(timezone.utc).isoformat()
    event_types = _normalize_event_types(body.event_types)
    row = (
        supabase.table("webhook_subscriptions")
        .insert(
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "endpoint_url": body.endpoint_url.strip(),
                "secret": (body.secret or "").strip() or None,
                "event_types": event_types,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        )
        .execute()
    ).data or []
    return {"item": row[0] if row else None}


@router.patch("/webhooks/{webhook_id}")
async def update_webhook(request: Request, webhook_id: str, body: WebhookUpdateRequest):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    exists = (
        supabase.table("webhook_subscriptions")
        .select("id")
        .eq("id", webhook_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not exists:
        raise HTTPException(status_code=404, detail="webhook_not_found")
    payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    fields = body.model_fields_set
    if "name" in fields:
        payload["name"] = (body.name or "").strip()
    if "endpoint_url" in fields:
        payload["endpoint_url"] = (body.endpoint_url or "").strip()
    if "secret" in fields:
        payload["secret"] = (body.secret or "").strip() or None
    if "event_types" in fields:
        payload["event_types"] = _normalize_event_types(body.event_types)
    if "is_active" in fields and body.is_active is not None:
        payload["is_active"] = bool(body.is_active)
    supabase.table("webhook_subscriptions").update(payload).eq("id", webhook_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(request: Request, webhook_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    supabase.table("webhook_subscriptions").update({"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", webhook_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.post("/webhooks/{webhook_id}/test")
async def send_test_event(request: Request, webhook_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    exists = (
        supabase.table("webhook_subscriptions")
        .select("id")
        .eq("id", webhook_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not exists:
        raise HTTPException(status_code=404, detail="webhook_not_found")
    await emit_webhook_event(
        supabase=supabase,
        user_id=user_id,
        event_type="tool_called",
        payload={"test": True, "webhook_id": webhook_id},
        max_retries=max(0, int(getattr(settings, "webhook_retry_max_retries", 5))),
        base_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_base_backoff_seconds", 30))),
        max_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_max_backoff_seconds", 900))),
    )
    return {"ok": True}


@router.get("/deliveries")
async def list_deliveries(
    request: Request,
    status: str = Query("all"),
    event_type: str = Query(""),
    webhook_id: int | None = Query(default=None),
    organization_id: int | None = Query(default=None),
    team_id: int | None = Query(default=None),
    limit: int = Query(50, ge=1, le=300),
):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.MEMBER, method=request.method)
    scoped_user_ids = _resolve_scoped_user_ids(
        supabase=supabase,
        authz_ctx=authz_ctx,
        request_user_id=user_id,
        organization_id=organization_id,
        team_id=team_id,
    )
    normalized_status = status.strip().lower()
    if not scoped_user_ids:
        rows = []
    else:
        query = supabase.table("webhook_deliveries").select(
            "id,subscription_id,event_type,status,http_status,error_message,retry_count,next_retry_at,delivered_at,created_at"
        )
        if len(scoped_user_ids) == 1:
            query = query.eq("user_id", scoped_user_ids[0])
        else:
            query = query.in_("user_id", scoped_user_ids)
        if normalized_status and normalized_status != "all":
            query = query.eq("status", normalized_status)
        if event_type.strip():
            query = query.eq("event_type", event_type.strip())
        if webhook_id is not None:
            query = query.eq("subscription_id", webhook_id)
        rows = query.order("created_at", desc=True).limit(limit).execute().data or []
    return {"items": rows, "count": len(rows)}


@router.post("/deliveries/{delivery_id}/retry")
async def retry_delivery(request: Request, delivery_id: str):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    result = await retry_webhook_delivery(
        supabase=supabase,
        user_id=user_id,
        delivery_id=delivery_id,
        max_retries=max(0, int(getattr(settings, "webhook_retry_max_retries", 5))),
        base_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_base_backoff_seconds", 30))),
        max_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_max_backoff_seconds", 900))),
    )
    if result is None:
        raise HTTPException(status_code=404, detail="delivery_not_found")
    dead_letter_status = str(result.get("status") or "").strip().lower()
    dead_letter_alert_url = str(getattr(settings, "dead_letter_alert_webhook_url", "") or "").strip()
    if dead_letter_status == "dead_letter" and dead_letter_alert_url:
        await send_dead_letter_alert(
            webhook_url=dead_letter_alert_url,
            user_id=user_id,
            source="manual_retry",
            dead_lettered=1,
            details={
                "delivery_id": delivery_id,
                "status": dead_letter_status,
                "error_message": result.get("error_message"),
            },
            ticket_webhook_url=str(getattr(settings, "alert_ticket_webhook_url", "") or "").strip() or None,
            dedupe_window_seconds=max(0, int(getattr(settings, "dead_letter_alert_dedupe_seconds", 300))),
        )
    return {"ok": True, "result": result}


@router.post("/deliveries/process-retries")
async def process_deliveries(request: Request, limit: int = Query(100, ge=1, le=500)):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)
    require_min_role(authz_ctx, Role.ADMIN, method=request.method)
    result = await process_pending_webhook_retries(
        supabase=supabase,
        user_id=user_id,
        limit=limit,
        max_retries=max(0, int(getattr(settings, "webhook_retry_max_retries", 5))),
        base_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_base_backoff_seconds", 30))),
        max_backoff_seconds=max(1, int(getattr(settings, "webhook_retry_max_backoff_seconds", 900))),
    )
    dead_lettered = max(0, int(result.get("dead_lettered") or 0))
    dead_letter_alert_url = str(getattr(settings, "dead_letter_alert_webhook_url", "") or "").strip()
    dead_letter_min_count = max(1, int(getattr(settings, "dead_letter_alert_min_count", 1)))
    if dead_letter_alert_url and dead_lettered >= dead_letter_min_count:
        await send_dead_letter_alert(
            webhook_url=dead_letter_alert_url,
            user_id=user_id,
            source="process_retries",
            dead_lettered=dead_lettered,
            details={"result": result, "limit": limit},
            ticket_webhook_url=str(getattr(settings, "alert_ticket_webhook_url", "") or "").strip() or None,
            dedupe_window_seconds=max(0, int(getattr(settings, "dead_letter_alert_dedupe_seconds", 300))),
        )
    return {"ok": True, **result}
