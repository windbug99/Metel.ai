#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[phase3-dashboard] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${USER_JWT:-}" ]]; then
  echo "[phase3-dashboard] ERROR: USER_JWT is required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"

echo "[phase3-dashboard] API_BASE_URL=${API_BASE_URL}"
echo "[phase3-dashboard] fetch tool-calls and audit summaries"

tool_calls_body="$(
  curl -sS -H "Authorization: Bearer ${USER_JWT}" \
    "${API_BASE_URL}/api/tool-calls?limit=200&status=all"
)"
audit_body="$(
  curl -sS -H "Authorization: Bearer ${USER_JWT}" \
    "${API_BASE_URL}/api/audit/events?limit=200&status=all"
)"

python3 - "${tool_calls_body}" "${audit_body}" <<'PY'
import json
import sys

tool_calls = json.loads(sys.argv[1])
audit = json.loads(sys.argv[2])

fails = []
passes = 0

def ratio(num: int, den: int) -> float:
    if den <= 0:
        return 0.0
    return round(num / den, 4)

def assert_eq(actual, expected, label: str):
    global passes
    if actual == expected:
        print(f"[PASS] {label}")
        passes += 1
    else:
        print(f"[FAIL] {label}: expected={expected!r} actual={actual!r}")
        fails.append(label)

def assert_true(cond: bool, label: str):
    global passes
    if cond:
        print(f"[PASS] {label}")
        passes += 1
    else:
        print(f"[FAIL] {label}")
        fails.append(label)

tool_summary = tool_calls.get("summary") or {}
calls_24h = int(tool_summary.get("calls_24h") or 0)
success_24h = int(tool_summary.get("success_24h") or 0)
fail_24h = int(tool_summary.get("fail_24h") or 0)
policy_blocked_24h = int(tool_summary.get("policy_blocked_24h") or 0)
upstream_temporary_24h = int(tool_summary.get("upstream_temporary_24h") or 0)
high_risk_allowed_24h = int(tool_summary.get("high_risk_allowed_24h") or 0)

assert_eq(tool_summary.get("fail_rate_24h"), ratio(fail_24h, calls_24h), "tool_calls.fail_rate_24h formula")
assert_eq(tool_summary.get("blocked_rate_24h"), ratio(policy_blocked_24h, calls_24h), "tool_calls.blocked_rate_24h formula")
assert_eq(
    tool_summary.get("retryable_fail_rate_24h"),
    ratio(upstream_temporary_24h, calls_24h),
    "tool_calls.retryable_fail_rate_24h formula",
)
assert_eq(
    tool_summary.get("policy_override_usage_24h"),
    ratio(high_risk_allowed_24h, calls_24h),
    "tool_calls.policy_override_usage_24h formula",
)
assert_true(success_24h + fail_24h <= calls_24h, "tool_calls.success+fail <= calls")

audit_items = audit.get("items") or []
audit_summary = audit.get("summary") or {}

computed = {
    "allowed_count": 0,
    "high_risk_allowed_count": 0,
    "policy_blocked_count": 0,
    "access_denied_count": 0,
    "failed_count": 0,
}
for row in audit_items:
    outcome = row.get("outcome") or {}
    decision = str(outcome.get("decision") or "")
    if decision == "allowed":
        computed["allowed_count"] += 1
    elif decision == "policy_override_allowed":
        computed["high_risk_allowed_count"] += 1
    elif decision == "policy_blocked":
        computed["policy_blocked_count"] += 1
    elif decision == "access_denied":
        computed["access_denied_count"] += 1
    else:
        computed["failed_count"] += 1

for key, value in computed.items():
    assert_eq(int(audit_summary.get(key) or 0), value, f"audit.{key} matches items")

assert_eq(
    audit_summary.get("policy_override_usage"),
    ratio(computed["high_risk_allowed_count"], len(audit_items)),
    "audit.policy_override_usage formula",
)

print(f"[phase3-dashboard] pass={passes} fail={len(fails)}")
if fails:
    raise SystemExit(1)
print("[phase3-dashboard] done")
PY
