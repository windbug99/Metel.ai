#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DASHBOARD_ROOT_PAGE="${ROOT_DIR}/frontend/app/dashboard/page.tsx"
LEGACY_PAGE="${ROOT_DIR}/frontend/app/dashboard/legacy/page.tsx"
SHELL_PAGE="${ROOT_DIR}/frontend/components/dashboard-v2/shell.tsx"
NOTION_ROUTE="${ROOT_DIR}/backend/app/routes/notion.py"
LINEAR_ROUTE="${ROOT_DIR}/backend/app/routes/linear.py"

for f in "${DASHBOARD_ROOT_PAGE}" "${LEGACY_PAGE}" "${SHELL_PAGE}" "${NOTION_ROUTE}" "${LINEAR_ROUTE}"; do
  if [[ ! -f "${f}" ]]; then
    echo "[dashboard-v2-deeplink-static] ERROR: missing file ${f}"
    exit 1
  fi
done

PASS=0
FAIL=0

match_pattern() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "${pattern}" "${file}"
  else
    grep -Eq "${pattern}" "${file}"
  fi
}

pass() {
  echo "[PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "[FAIL] $1"
  FAIL=$((FAIL + 1))
}

expect_pattern() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if match_pattern "${pattern}" "${file}"; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

echo "[dashboard-v2-deeplink-static] validate route mapping and redirect guards"

# /dashboard -> /dashboard/overview and hash mappings
expect_pattern "${DASHBOARD_ROOT_PAGE}" "#overview\": \"/dashboard/overview\"" "root hash mapping: #overview"
expect_pattern "${DASHBOARD_ROOT_PAGE}" "#api-keys\": \"/dashboard/access/api-keys\"" "root hash mapping: #api-keys"
expect_pattern "${DASHBOARD_ROOT_PAGE}" "#audit-events\": \"/dashboard/control/audit-events\"" "root hash mapping: #audit-events"
expect_pattern "${DASHBOARD_ROOT_PAGE}" "HASH_TO_ROUTE\\[hash\\] \\?\\? \"/dashboard/overview\"" "root default redirect to /dashboard/overview"
expect_pattern "${DASHBOARD_ROOT_PAGE}" "window.location.search" "root redirect preserves query string"

# legacy hash compatibility
expect_pattern "${LEGACY_PAGE}" "LEGACY_HASH_TO_V2_ROUTE" "legacy hash map constant exists"
expect_pattern "${LEGACY_PAGE}" "#overview\": \"/dashboard/overview\"" "legacy hash mapping: #overview"
expect_pattern "${LEGACY_PAGE}" "#api-keys\": \"/dashboard/access/api-keys\"" "legacy hash mapping: #api-keys"
expect_pattern "${LEGACY_PAGE}" "#audit-events\": \"/dashboard/control/audit-events\"" "legacy hash mapping: #audit-events"
expect_pattern "${LEGACY_PAGE}" "window.location.search" "legacy redirect preserves query string"

# auth-expired deep-link next restore
expect_pattern "${SHELL_PAGE}" "buildNextPath" "shell uses buildNextPath"
expect_pattern "${SHELL_PAGE}" "router.replace" "shell has redirect handler"
expect_pattern "${SHELL_PAGE}" "\\/\\?next=\\$\\{next\\}" "shell preserves next on 401 redirect"

# OAuth callback landing compatibility
expect_pattern "${NOTION_ROUTE}" "\\/dashboard\\?notion=connected" "notion oauth callback redirects with notion=connected"
expect_pattern "${LINEAR_ROUTE}" "\\/dashboard\\?linear=connected" "linear oauth callback redirects with linear=connected"

echo "[dashboard-v2-deeplink-static] pass=${PASS} fail=${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
echo "[dashboard-v2-deeplink-static] done"
