#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[rbac-rollout] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[rbac-rollout] ERROR: OWNER_JWT, ADMIN_JWT, MEMBER_JWT are required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"
EXPECT_READ_GUARD="${EXPECT_READ_GUARD:-1}"
EXPECT_WRITE_GUARD="${EXPECT_WRITE_GUARD:-0}"
EXPECT_UI_STRICT="${EXPECT_UI_STRICT:-0}"

PASS_COUNT=0
FAIL_COUNT=0

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

http_status() {
  local token="$1"
  local method="$2"
  local path="$3"
  local data="${4:-}"
  if [[ -n "${data}" ]]; then
    curl -sS -o /dev/null -w "%{http_code}" \
      -X "${method}" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -d "${data}" \
      "${API_BASE_URL}${path}"
    return
  fi
  curl -sS -o /dev/null -w "%{http_code}" \
    -X "${method}" \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE_URL}${path}"
}

echo "[rbac-rollout] API_BASE_URL=${API_BASE_URL}"
echo "[rbac-rollout] expected flags read=${EXPECT_READ_GUARD} write=${EXPECT_WRITE_GUARD} ui_strict=${EXPECT_UI_STRICT}"

owner_permissions="$(
  curl -sS -H "Authorization: Bearer ${OWNER_JWT}" \
    "${API_BASE_URL}/api/me/permissions"
)"

if python3 - "${owner_permissions}" "${EXPECT_READ_GUARD}" "${EXPECT_WRITE_GUARD}" "${EXPECT_UI_STRICT}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
expect_read = bool(int(sys.argv[2]))
expect_write = bool(int(sys.argv[3]))
expect_ui = bool(int(sys.argv[4]))

flags = payload.get("feature_flags") or {}
assert payload.get("role") == "owner", f"owner role expected, got {payload.get('role')!r}"
assert bool(flags.get("read_guard_enabled")) == expect_read, "read_guard_enabled mismatch"
assert bool(flags.get("write_guard_enabled")) == expect_write, "write_guard_enabled mismatch"
assert bool(flags.get("ui_strict_enabled")) == expect_ui, "ui_strict_enabled mismatch"
print("ok")
PY
then
  record_pass "/api/me/permissions feature_flags match expected rollout mode"
else
  record_fail "/api/me/permissions feature_flags mismatch"
fi

member_admin_read_status="$(http_status "${MEMBER_JWT}" GET "/api/admin/external-health?days=1")"
expected_member_admin_read_status="200"
if [[ "${EXPECT_READ_GUARD}" == "1" ]]; then
  expected_member_admin_read_status="403"
fi
if [[ "${member_admin_read_status}" == "${expected_member_admin_read_status}" ]]; then
  record_pass "member admin-read status=${member_admin_read_status}"
else
  record_fail "member admin-read expected ${expected_member_admin_read_status}, got ${member_admin_read_status}"
fi

owner_audit_patch_status="$(http_status "${OWNER_JWT}" PATCH "/api/audit/settings" '{"retention_days":90}')"
if [[ "${owner_audit_patch_status}" == "200" ]]; then
  record_pass "owner audit-settings patch allowed"
else
  record_fail "owner audit-settings patch expected 200, got ${owner_audit_patch_status}"
fi

admin_audit_patch_status="$(http_status "${ADMIN_JWT}" PATCH "/api/audit/settings" '{"retention_days":90}')"
member_audit_patch_status="$(http_status "${MEMBER_JWT}" PATCH "/api/audit/settings" '{"retention_days":90}')"
expected_non_owner_write_status="200"
if [[ "${EXPECT_WRITE_GUARD}" == "1" ]]; then
  expected_non_owner_write_status="403"
fi

if [[ "${admin_audit_patch_status}" == "${expected_non_owner_write_status}" ]]; then
  record_pass "admin audit-settings patch status=${admin_audit_patch_status}"
else
  record_fail "admin audit-settings patch expected ${expected_non_owner_write_status}, got ${admin_audit_patch_status}"
fi

if [[ "${member_audit_patch_status}" == "${expected_non_owner_write_status}" ]]; then
  record_pass "member audit-settings patch status=${member_audit_patch_status}"
else
  record_fail "member audit-settings patch expected ${expected_non_owner_write_status}, got ${member_audit_patch_status}"
fi

echo "[rbac-rollout] pass=${PASS_COUNT} fail=${FAIL_COUNT}"
if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi
echo "[rbac-rollout] done"
