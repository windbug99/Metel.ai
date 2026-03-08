#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="${ROOT_DIR}/backend/scripts"
STRICT_WARN_AS_FAIL="${STRICT_WARN_AS_FAIL:-0}"

DASHBOARD_ROOT_PAGE="${ROOT_DIR}/frontend/app/dashboard/page.tsx"
FRONTEND_ENV_EXAMPLE="${ROOT_DIR}/frontend/.env.example"
NAV_MAIN_PAGE="${ROOT_DIR}/frontend/components/dashboard-v2/sidebar07/nav-main.tsx"

PASS=0
FAIL=0
WARN=0

pass() {
  echo "[PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "[FAIL] $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo "[WARN] $1"
  WARN=$((WARN + 1))
}

match_pattern() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "${pattern}" "${file}"
  else
    grep -Eq "${pattern}" "${file}"
  fi
}

echo "[dashboard-v2-transition] readiness check start"

if [[ -f "${DASHBOARD_ROOT_PAGE}" ]] && match_pattern '"/dashboard/overview"' "${DASHBOARD_ROOT_PAGE}"; then
  pass "/dashboard root redirect configured"
else
  fail "/dashboard root redirect missing"
fi

if [[ -f "${FRONTEND_ENV_EXAMPLE}" ]] \
  && match_pattern '^NEXT_PUBLIC_DASHBOARD_GLOBAL_SEARCH_ENABLED=' "${FRONTEND_ENV_EXAMPLE}"; then
  pass "frontend env example includes dashboard v2 flags"
else
  fail "frontend/.env.example missing dashboard v2 flag entries"
fi

if [[ -f "${NAV_MAIN_PAGE}" ]] \
  && match_pattern 'Organization' "${NAV_MAIN_PAGE}" \
  && match_pattern 'Team' "${NAV_MAIN_PAGE}" \
  && match_pattern 'User' "${NAV_MAIN_PAGE}"; then
  pass "sidebar section labels (Organization/Team/User) configured"
else
  fail "sidebar section labels missing in nav-main"
fi

if "${SCRIPT_DIR}/run_dashboard_v2_qa_stage_gate.sh"; then
  pass "qa stage gate passed"
else
  fail "qa stage gate failed"
fi

if "${SCRIPT_DIR}/check_dashboard_mobile_manual_qa_log.sh"; then
  pass "mobile manual QA log completed"
else
  warn "mobile manual QA log still pending"
fi

echo "[dashboard-v2-transition] pass=${PASS} fail=${FAIL} warn=${WARN}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
if [[ "${STRICT_WARN_AS_FAIL}" == "1" && "${WARN}" -gt 0 ]]; then
  echo "[dashboard-v2-transition] strict mode: warn treated as fail"
  exit 1
fi
echo "[dashboard-v2-transition] done"
