from __future__ import annotations

from fastapi import APIRouter, Query, Request
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.config import get_settings

router = APIRouter(prefix="/api/connector-jobs", tags=["connector-jobs"])


@router.get("")
async def list_connector_job_runs(
    request: Request,
    provider: str = Query(default=""),
    job_type: str = Query(default=""),
    resource_id: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=100),
):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    query = (
        supabase.table("connector_job_runs")
        .select("id,provider,job_type,external_job_id,resource_id,resource_title,status,result_payload,download_urls,error_message,created_at,updated_at")
        .eq("user_id", user_id)
    )
    if provider.strip():
        query = query.eq("provider", provider.strip().lower())
    if job_type.strip():
        query = query.eq("job_type", job_type.strip().lower())
    if resource_id.strip():
        query = query.eq("resource_id", resource_id.strip())
    if status.strip():
        query = query.eq("status", status.strip().lower())

    rows = query.order("updated_at", desc=True).limit(limit).execute().data or []
    return {"items": rows, "count": len(rows)}
