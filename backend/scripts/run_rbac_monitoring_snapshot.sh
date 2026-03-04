#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[rbac-monitor] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${OWNER_JWT:-}" ]]; then
  echo "[rbac-monitor] ERROR: OWNER_JWT is required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"
ALERT_ACCESS_DENIED_24H="${ALERT_ACCESS_DENIED_24H:-50}"
ALERT_FAIL_RATE_24H="${ALERT_FAIL_RATE_24H:-0.2}"
ALERT_POLICY_BLOCK_RATE="${ALERT_POLICY_BLOCK_RATE:-0.4}"

echo "[rbac-monitor] API_BASE_URL=${API_BASE_URL}"
echo "[rbac-monitor] thresholds access_denied_24h=${ALERT_ACCESS_DENIED_24H} fail_rate_24h=${ALERT_FAIL_RATE_24H} policy_override_usage=${ALERT_POLICY_BLOCK_RATE}"

tool_calls_body="$(
  curl -sS -H "Authorization: Bearer ${OWNER_JWT}" \
    "${API_BASE_URL}/api/tool-calls?limit=200&status=all"
)"
audit_body="$(
  curl -sS -H "Authorization: Bearer ${OWNER_JWT}" \
    "${API_BASE_URL}/api/audit/events?limit=200&status=all"
)"

if python3 - "${tool_calls_body}" "${audit_body}" "${ALERT_ACCESS_DENIED_24H}" "${ALERT_FAIL_RATE_24H}" "${ALERT_POLICY_BLOCK_RATE}" <<'PY'
import json
import sys

tool = json.loads(sys.argv[1]).get("summary") or {}
audit = json.loads(sys.argv[2]).get("summary") or {}
th_access_denied = int(sys.argv[3])
th_fail_rate = float(sys.argv[4])
th_policy_override = float(sys.argv[5])

access_denied_24h = int(tool.get("access_denied_24h") or 0)
fail_rate_24h = float(tool.get("fail_rate_24h") or 0.0)
policy_override_usage = float(tool.get("policy_override_usage_24h") or 0.0)

print("[rbac-monitor] snapshot")
print(f"  calls_24h={int(tool.get('calls_24h') or 0)}")
print(f"  access_denied_24h={access_denied_24h}")
print(f"  fail_rate_24h={fail_rate_24h}")
print(f"  policy_override_usage_24h={policy_override_usage}")
print(f"  audit_access_denied_count={int(audit.get('access_denied_count') or 0)}")
print(f"  audit_failed_count={int(audit.get('failed_count') or 0)}")

violations = []
if access_denied_24h > th_access_denied:
    violations.append(f"access_denied_24h>{th_access_denied}")
if fail_rate_24h > th_fail_rate:
    violations.append(f"fail_rate_24h>{th_fail_rate}")
if policy_override_usage > th_policy_override:
    violations.append(f"policy_override_usage_24h>{th_policy_override}")

if violations:
    print("[rbac-monitor] ALERT " + ", ".join(violations))
    raise SystemExit(2)
print("[rbac-monitor] OK")
PY
then
  :
else
  exit $?
fi

if [[ -n "${ADMIN_JWT:-}" && -n "${MEMBER_JWT:-}" ]]; then
  echo "[rbac-monitor] probe expected authorization matrix (full guard assumption)"

  owner_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${OWNER_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"
  admin_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${ADMIN_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"
  member_patch_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${MEMBER_JWT}" \
      -H "Content-Type: application/json" \
      -d '{"retention_days":90}' \
      "${API_BASE_URL}/api/audit/settings"
  )"

  if [[ "${owner_patch_status}" != "200" ]]; then
    echo "[rbac-monitor] ALERT false-deny suspected: owner PATCH /api/audit/settings=${owner_patch_status}"
    exit 3
  fi
  if [[ "${admin_patch_status}" != "403" || "${member_patch_status}" != "403" ]]; then
    echo "[rbac-monitor] ALERT policy-regression suspected: admin/member PATCH statuses=${admin_patch_status}/${member_patch_status}"
    exit 4
  fi
  echo "[rbac-monitor] probe OK owner=200 admin=403 member=403"
else
  echo "[rbac-monitor] admin/member probe skipped (set ADMIN_JWT and MEMBER_JWT)"
fi

echo "[rbac-monitor] done"
