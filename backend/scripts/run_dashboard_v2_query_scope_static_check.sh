#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHELL_PAGE="${ROOT_DIR}/frontend/components/dashboard-v2/shell.tsx"

if [[ ! -f "${SHELL_PAGE}" ]]; then
  echo "[dashboard-v2-query-scope] ERROR: missing file ${SHELL_PAGE}"
  exit 1
fi

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
  local pattern="$1"
  local label="$2"
  if match_pattern "${pattern}" "${SHELL_PAGE}"; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

echo "[dashboard-v2-query-scope] validate global/page query scope policy"

expect_pattern "GLOBAL_QUERY_KEYS = \\[\"org\", \"team\", \"range\"\\]" "global query keys declared"
expect_pattern "overview: \\[\"overview_window\"\\]" "overview page query key declared"
expect_pattern "apiKeys: \\[\"keys_status\"\\]" "api-keys page query key declared"
expect_pattern "auditEvents: \\[\"audit_status\"\\]" "audit-events page query key declared"
expect_pattern "adminOps: \\[\"ops_tab\"\\]" "admin-ops page query key declared"
expect_pattern "for \\(const key of GLOBAL_QUERY_KEYS\\)" "nav/global update iterates only global keys"
expect_pattern "const allowed = new Set<string>\\(\\[\\.\\.\\.GLOBAL_QUERY_KEYS, \\.\\.\\.PAGE_QUERY_KEYS\\[pageKey\\]\\]\\)" "allowed set merges global + current page keys"
expect_pattern "if \\(!allowed\\.has\\(key\\)\\) \\{" "unknown query keys are filtered"
expect_pattern "params\\.delete\\(key\\);" "unknown/page-irrelevant query keys deleted"
expect_pattern "href=\\{buildNavHref\\(item\\.href\\)\\}" "sidebar navigation keeps global query keys"

echo "[dashboard-v2-query-scope] pass=${PASS} fail=${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
echo "[dashboard-v2-query-scope] done"
