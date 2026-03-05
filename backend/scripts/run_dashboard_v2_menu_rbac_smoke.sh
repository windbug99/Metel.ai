#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[dashboard-v2-menu-rbac] ERROR: API_BASE_URL is required"
  exit 1
fi

if [[ -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[dashboard-v2-menu-rbac] ERROR: OWNER_JWT, ADMIN_JWT, MEMBER_JWT are required"
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"

echo "[dashboard-v2-menu-rbac] API_BASE_URL=${API_BASE_URL}"

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

python3 - "${owner_perm}" "${admin_perm}" "${member_perm}" <<'PY'
import json
import sys

owner = json.loads(sys.argv[1])
admin = json.loads(sys.argv[2])
member = json.loads(sys.argv[3])

BASE_MENU = ["overview", "api-keys", "audit-events"]

def visible_menu(row: dict) -> list[str]:
    items = list(BASE_MENU)
    if bool((row.get("permissions") or {}).get("can_read_admin_ops")):
        items.append("admin-ops")
    return items

def expect(cond: bool, label: str):
    if not cond:
        raise AssertionError(label)
    print(f"[PASS] {label}")

expect(owner.get("role") == "owner", "owner.role == owner")
expect(admin.get("role") == "admin", "admin.role == admin")
expect(member.get("role") == "member", "member.role == member")

expect(visible_menu(owner) == ["overview", "api-keys", "audit-events", "admin-ops"], "owner visible menu")
expect(visible_menu(admin) == ["overview", "api-keys", "audit-events", "admin-ops"], "admin visible menu")
expect(visible_menu(member) == ["overview", "api-keys", "audit-events"], "member visible menu")

expect(bool((owner.get("permissions") or {}).get("can_manage_incident_banner")) is True, "owner incident-banner manage")
expect(bool((admin.get("permissions") or {}).get("can_manage_incident_banner")) is False, "admin incident-banner denied")
expect(bool((member.get("permissions") or {}).get("can_manage_incident_banner")) is False, "member incident-banner denied")

print("[dashboard-v2-menu-rbac] done")
PY
