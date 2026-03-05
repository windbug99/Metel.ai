#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[rbac-token-validate] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[rbac-token-validate] ERROR: OWNER_JWT, ADMIN_JWT, MEMBER_JWT are required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"

check_role() {
  local expected_role="$1"
  local token="$2"

  local body
  body="$(curl -sS -H "Authorization: Bearer ${token}" "${API_BASE_URL}/api/me/permissions")"

  python3 - "${expected_role}" "${body}" <<'PY'
import json
import sys

expected = sys.argv[1]
raw = sys.argv[2]
try:
    payload = json.loads(raw)
except Exception:
    print(f"[rbac-token-validate] ERROR: /api/me/permissions is not json for expected={expected}")
    raise SystemExit(1)

role = payload.get("role")
if role != expected:
    detail = payload.get("detail")
    user_id = payload.get("user_id")
    print(f"[rbac-token-validate] ERROR: expected role={expected}, got role={role!r}, user_id={user_id!r}, detail={detail!r}")
    raise SystemExit(1)

print(f"[rbac-token-validate] PASS: role={expected}, user_id={payload.get('user_id')!r}")
PY
}

echo "[rbac-token-validate] API_BASE_URL=${API_BASE_URL}"
check_role "owner" "${OWNER_JWT}"
check_role "admin" "${ADMIN_JWT}"
check_role "member" "${MEMBER_JWT}"
echo "[rbac-token-validate] done"
