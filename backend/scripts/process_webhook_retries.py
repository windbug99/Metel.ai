from __future__ import annotations

import argparse
import asyncio
import json
import sys

from supabase import create_client

from app.core.config import get_settings
from app.core.dead_letter_alert import send_dead_letter_alert
from app.core.event_hooks import process_pending_webhook_retries


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Process pending webhook retries for all users.")
    parser.add_argument("--limit", type=int, default=500, help="Max deliveries to scan in one run (1-500).")
    parser.add_argument(
        "--user-id",
        type=str,
        default="",
        help="Optional user_id scope. If omitted, process all users.",
    )
    return parser


async def _run(limit: int, user_id: str) -> int:
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    result = await process_pending_webhook_retries(
        supabase=supabase,
        user_id=user_id or None,
        limit=max(1, min(int(limit), 500)),
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
            user_id=user_id or "all",
            source="scheduler_process_retries",
            dead_lettered=dead_lettered,
            details={"result": result, "limit": limit},
        )
    print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    return 0


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    try:
        return asyncio.run(_run(limit=args.limit, user_id=str(args.user_id or "").strip()))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
