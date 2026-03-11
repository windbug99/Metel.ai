from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import create_client

from app.core.config import get_settings


def _connector_jobs_client():
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _load_existing_job(*, supabase, provider: str, job_type: str, external_job_id: str) -> dict[str, Any] | None:
    rows = (
        supabase.table("connector_job_runs")
        .select("*")
        .eq("provider", provider)
        .eq("job_type", job_type)
        .eq("external_job_id", external_job_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def record_connector_job_run(
    *,
    user_id: str,
    provider: str,
    job_type: str,
    status: str,
    external_job_id: str | None = None,
    resource_id: str | None = None,
    resource_title: str | None = None,
    request_payload: dict[str, Any] | None = None,
    result_payload: dict[str, Any] | None = None,
    download_urls: list[str] | None = None,
    error_message: str | None = None,
) -> dict[str, Any] | None:
    supabase = _connector_jobs_client()
    now = datetime.now(timezone.utc).isoformat()
    provider_value = str(provider or "").strip().lower()
    job_type_value = str(job_type or "").strip().lower()
    external_job_id_value = str(external_job_id or "").strip() or None

    payload: dict[str, Any] = {
        "user_id": user_id,
        "provider": provider_value,
        "job_type": job_type_value,
        "status": str(status or "").strip().lower() or "unknown",
        "updated_at": now,
        "request_payload": request_payload if isinstance(request_payload, dict) else None,
        "result_payload": result_payload if isinstance(result_payload, dict) else None,
        "download_urls": [str(item).strip() for item in (download_urls or []) if str(item).strip()] or None,
        "error_message": (error_message or "").strip() or None,
    }

    if resource_id is not None:
        payload["resource_id"] = str(resource_id).strip() or None
    if resource_title is not None:
        payload["resource_title"] = str(resource_title).strip() or None

    if external_job_id_value:
        payload["external_job_id"] = external_job_id_value
        existing = _load_existing_job(
            supabase=supabase,
            provider=provider_value,
            job_type=job_type_value,
            external_job_id=external_job_id_value,
        )
        if existing:
            merged = {
                **existing,
                **{key: value for key, value in payload.items() if value is not None},
                "updated_at": now,
            }
            rows = (
                supabase.table("connector_job_runs")
                .upsert(merged, on_conflict="provider,job_type,external_job_id")
                .execute()
            ).data or []
            return rows[0] if rows else merged
        payload["created_at"] = now
        rows = (
            supabase.table("connector_job_runs")
            .upsert(payload, on_conflict="provider,job_type,external_job_id")
            .execute()
        ).data or []
        return rows[0] if rows else payload

    payload["created_at"] = now
    rows = supabase.table("connector_job_runs").insert(payload).execute().data or []
    return rows[0] if rows else payload
