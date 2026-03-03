from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    reason: str | None = None
    risk_type: str | None = None


_HIGH_RISK_TOOL_NAMES = {
    "notion_delete_block",
}


def evaluate_risk(tool_name: str, payload: dict[str, Any]) -> RiskDecision:
    return evaluate_risk_with_policy(tool_name=tool_name, payload=payload, policy=None)


def evaluate_risk_with_policy(
    *,
    tool_name: str,
    payload: dict[str, Any],
    policy: dict[str, Any] | None,
) -> RiskDecision:
    base = _evaluate_without_policy(tool_name=tool_name, payload=payload)
    if not base.allowed and isinstance(policy, dict) and bool(policy.get("allow_high_risk")):
        return RiskDecision(allowed=True, reason="policy_override_high_risk", risk_type=base.risk_type)
    return base


def _evaluate_without_policy(*, tool_name: str, payload: dict[str, Any]) -> RiskDecision:
    normalized = tool_name.strip()
    if normalized in _HIGH_RISK_TOOL_NAMES:
        return RiskDecision(allowed=False, reason="high_risk_tool_blocked_by_default", risk_type="delete")

    if normalized == "notion_update_page":
        if bool(payload.get("archived")) or bool(payload.get("in_trash")):
            return RiskDecision(allowed=False, reason="archive_or_trash_blocked_by_default", risk_type="archive")

    if normalized == "linear_update_issue":
        if bool(payload.get("archived")):
            return RiskDecision(allowed=False, reason="archive_or_trash_blocked_by_default", risk_type="archive")

    return RiskDecision(allowed=True)
