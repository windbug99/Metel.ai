#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[phase3-dashboard] ERROR: API_BASE_URL is required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"
OWNER_JWT="${OWNER_JWT:-}"
ADMIN_JWT="${ADMIN_JWT:-}"
MEMBER_JWT="${MEMBER_JWT:-}"
LEGACY_USER_JWT="${USER_JWT:-}"

if [[ -z "${OWNER_JWT}" && -z "${ADMIN_JWT}" && -z "${MEMBER_JWT}" ]]; then
  if [[ -z "${LEGACY_USER_JWT}" ]]; then
    echo "[phase3-dashboard] ERROR: provide USER_JWT or one of OWNER_JWT/ADMIN_JWT/MEMBER_JWT"
    exit 1
  fi
  OWNER_JWT="${LEGACY_USER_JWT}"
  ADMIN_JWT="${LEGACY_USER_JWT}"
  MEMBER_JWT="${LEGACY_USER_JWT}"
  echo "[phase3-dashboard] role matrix tokens missing -> fallback to USER_JWT for all roles"
fi

echo "[phase3-dashboard] API_BASE_URL=${API_BASE_URL}"
echo "[phase3-dashboard] fetch tool-calls and audit summaries (member baseline)"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

record_pass() {
  local msg="$1"
  echo "[PASS] ${msg}"
  PASS_COUNT=$((PASS_COUNT + 1))
}

record_fail() {
  local msg="$1"
  echo "[FAIL] ${msg}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

record_skip() {
  local msg="$1"
  echo "[SKIP] ${msg}"
  SKIP_COUNT=$((SKIP_COUNT + 1))
}

http_status() {
  local token="$1"
  local method="$2"
  local path="$3"
  curl -sS -o /dev/null -w "%{http_code}" \
    -X "${method}" \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE_URL}${path}"
}

tool_calls_body="$(
  curl -sS -H "Authorization: Bearer ${MEMBER_JWT}" \
    "${API_BASE_URL}/api/tool-calls?limit=200&status=all"
)"
audit_body="$(
  curl -sS -H "Authorization: Bearer ${MEMBER_JWT}" \
    "${API_BASE_URL}/api/audit/events?limit=200&status=all"
)"

if python3 - "${tool_calls_body}" "${audit_body}" <<'PY'
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
then
  record_pass "dashboard summary formula consistency (member baseline)"
else
  record_fail "dashboard summary formula consistency (member baseline)"
fi

if [[ -n "${OWNER_JWT}" && -n "${ADMIN_JWT}" && -n "${MEMBER_JWT}" ]]; then
  echo "[phase3-dashboard] role matrix checks enabled"

  owner_perm="$(
    curl -sS -H "Authorization: Bearer ${OWNER_JWT}" \
      "${API_BASE_URL}/api/me/permissions"
  )"
  admin_perm="$(
    curl -sS -H "Authorization: Bearer ${ADMIN_JWT}" \
      "${API_BASE_URL}/api/me/permissions"
  )"
  member_perm="$(
    curl -sS -H "Authorization: Bearer ${MEMBER_JWT}" \
      "${API_BASE_URL}/api/me/permissions"
  )"

  if python3 - "${owner_perm}" "${admin_perm}" "${member_perm}" <<'PY'
import json
import sys

owner = json.loads(sys.argv[1])
admin = json.loads(sys.argv[2])
member = json.loads(sys.argv[3])

def expect(cond: bool, label: str):
    if not cond:
        raise AssertionError(label)

expect(owner.get("role") == "owner", "owner.role")
expect(bool(owner.get("permissions", {}).get("can_read_admin_ops")) is True, "owner.can_read_admin_ops")
expect(bool(owner.get("permissions", {}).get("can_update_audit_settings")) is True, "owner.can_update_audit_settings")
expect(bool(owner.get("permissions", {}).get("can_manage_incident_banner")) is True, "owner.can_manage_incident_banner")

expect(admin.get("role") == "admin", "admin.role")
expect(bool(admin.get("permissions", {}).get("can_read_admin_ops")) is True, "admin.can_read_admin_ops")
expect(bool(admin.get("permissions", {}).get("can_update_audit_settings")) is False, "admin.can_update_audit_settings")
expect(bool(admin.get("permissions", {}).get("can_manage_incident_banner")) is False, "admin.can_manage_incident_banner")

expect(member.get("role") == "member", "member.role")
expect(bool(member.get("permissions", {}).get("can_read_admin_ops")) is False, "member.can_read_admin_ops")
expect(bool(member.get("permissions", {}).get("can_manage_organizations")) is False, "member.can_manage_organizations")
expect(bool(member.get("permissions", {}).get("can_manage_teams")) is False, "member.can_manage_teams")
expect(bool(member.get("permissions", {}).get("can_manage_integrations")) is False, "member.can_manage_integrations")
print("ok")
PY
  then
    record_pass "/api/me/permissions role matrix"
  else
    record_fail "/api/me/permissions role matrix"
  fi

  owner_admin_read_status="$(http_status "${OWNER_JWT}" GET "/api/admin/external-health?days=1")"
  admin_admin_read_status="$(http_status "${ADMIN_JWT}" GET "/api/admin/external-health?days=1")"
  member_admin_read_status="$(http_status "${MEMBER_JWT}" GET "/api/admin/external-health?days=1")"

  [[ "${owner_admin_read_status}" == "200" ]] && record_pass "owner admin-read endpoint allowed" || record_fail "owner admin-read endpoint expected 200 got ${owner_admin_read_status}"
  [[ "${admin_admin_read_status}" == "200" ]] && record_pass "admin admin-read endpoint allowed" || record_fail "admin admin-read endpoint expected 200 got ${admin_admin_read_status}"
  [[ "${member_admin_read_status}" == "403" ]] && record_pass "member admin-read endpoint denied" || record_fail "member admin-read endpoint expected 403 got ${member_admin_read_status}"

  # Use dedicated request bodies for deterministic status.
  owner_audit_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${OWNER_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"
  admin_audit_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${ADMIN_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"
  member_audit_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${MEMBER_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"

  [[ "${owner_audit_patch_status}" == "200" ]] && record_pass "owner audit-settings patch allowed" || record_fail "owner audit-settings patch expected 200 got ${owner_audit_patch_status}"
  [[ "${admin_audit_patch_status}" == "403" ]] && record_pass "admin audit-settings patch denied" || record_fail "admin audit-settings patch expected 403 got ${admin_audit_patch_status}"
  [[ "${member_audit_patch_status}" == "403" ]] && record_pass "member audit-settings patch denied" || record_fail "member audit-settings patch expected 403 got ${member_audit_patch_status}"
else
  record_skip "role matrix checks skipped (OWNER_JWT/ADMIN_JWT/MEMBER_JWT not all set)"
fi

echo "[phase3-dashboard] pass=${PASS_COUNT} fail=${FAIL_COUNT} skip=${SKIP_COUNT}"
if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi
echo "[phase3-dashboard] done"
