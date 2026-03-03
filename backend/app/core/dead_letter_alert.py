from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx


def _format_text(*, user_id: str, source: str, dead_lettered: int, details: dict[str, Any] | None) -> str:
    return (
        ":rotating_light: dead-letter alert\n"
        f"- user_id: {user_id}\n"
        f"- source: {source}\n"
        f"- dead_lettered: {max(0, int(dead_lettered))}\n"
        f"- details: {details or {}}"
    )


async def send_dead_letter_alert(
    *,
    webhook_url: str,
    user_id: str,
    source: str,
    dead_lettered: int,
    details: dict[str, Any] | None = None,
) -> bool:
    url = str(webhook_url or "").strip()
    if not url:
        return False

    payload: dict[str, Any] = {
        "event": "dead_letter_alert",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "source": source,
        "dead_lettered": max(0, int(dead_lettered)),
        "details": details or {},
    }
    if "hooks.slack.com/services/" in url:
        # Slack Incoming Webhook expects message payload with `text`.
        payload = {
            "text": _format_text(
                user_id=user_id,
                source=source,
                dead_lettered=dead_lettered,
                details=details,
            )
        }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload)
        return 200 <= int(response.status_code) < 300
    except Exception:
        return False
