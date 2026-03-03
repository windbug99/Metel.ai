from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.config import get_settings

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _normalize_iso_datetime(value: str | None, *, field_name: str) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid_datetime:{field_name}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def _decision(status: str, error_code: str | None) -> str:
    code = str(error_code or "")
    if status == "success":
        if code == "policy_override_allowed":
            return "policy_override_allowed"
        return "allowed"
    if code == "policy_blocked":
        return "policy_blocked"
    if code in {"access_denied", "service_not_allowed", "tool_not_allowed_for_api_key"}:
        return "access_denied"
    return "failed"


@router.get("/events")
async def list_audit_events(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    status: str = Query("all"),
    tool_name: str = Query(""),
    api_key_id: int | None = Query(default=None),
    error_code: str = Query(""),
    from_: str = Query(default="", alias="from"),
    to: str = Query(default=""),
):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    normalized_status = status.strip().lower()
    if normalized_status not in {"all", "success", "fail"}:
        normalized_status = "all"
    normalized_tool_name = tool_name.strip()
    normalized_error_code = error_code.strip()
    from_iso = _normalize_iso_datetime(from_, field_name="from")
    to_iso = _normalize_iso_datetime(to, field_name="to")

    query = (
        supabase.table("tool_calls")
        .select("id,request_id,api_key_id,tool_name,status,error_code,latency_ms,created_at")
        .eq("user_id", user_id)
    )
    if normalized_status != "all":
        query = query.eq("status", normalized_status)
    if normalized_tool_name:
        query = query.eq("tool_name", normalized_tool_name)
    if api_key_id is not None:
        query = query.eq("api_key_id", api_key_id)
    if normalized_error_code:
        query = query.eq("error_code", normalized_error_code)
    if from_iso:
        query = query.gte("created_at", from_iso)
    if to_iso:
        query = query.lte("created_at", to_iso)

    result = query.order("created_at", desc=True).limit(limit).execute()
    rows = result.data or []

    key_rows = (
        supabase.table("api_keys")
        .select("id,name,key_prefix")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    key_map = {str(item.get("id")): item for item in key_rows}

    items: list[dict] = []
    decision_counts: dict[str, int] = {
        "allowed": 0,
        "policy_override_allowed": 0,
        "policy_blocked": 0,
        "access_denied": 0,
        "failed": 0,
    }
    for row in rows:
        status_value = str(row.get("status") or "")
        err = row.get("error_code")
        decision = _decision(status_value, err)
        decision_counts[decision] = decision_counts.get(decision, 0) + 1

        api_key_row = key_map.get(str(row.get("api_key_id")))
        items.append(
            {
                "id": row.get("id"),
                "request_id": row.get("request_id"),
                "timestamp": row.get("created_at"),
                "action": {"tool_name": row.get("tool_name")},
                "actor": {
                    "user_id": user_id,
                    "api_key": {
                        "id": api_key_row.get("id") if api_key_row else row.get("api_key_id"),
                        "name": api_key_row.get("name") if api_key_row else None,
                        "key_prefix": api_key_row.get("key_prefix") if api_key_row else None,
                    },
                },
                "outcome": {
                    "decision": decision,
                    "status": status_value,
                    "error_code": err,
                    "latency_ms": row.get("latency_ms"),
                },
            }
        )

    return {
        "items": items,
        "count": len(items),
        "summary": {
            "allowed_count": decision_counts.get("allowed", 0),
            "high_risk_allowed_count": decision_counts.get("policy_override_allowed", 0),
            "policy_override_usage": (
                round(decision_counts.get("policy_override_allowed", 0) / len(items), 4) if items else 0.0
            ),
            "policy_blocked_count": decision_counts.get("policy_blocked", 0),
            "access_denied_count": decision_counts.get("access_denied", 0),
            "failed_count": decision_counts.get("failed", 0),
        },
    }
