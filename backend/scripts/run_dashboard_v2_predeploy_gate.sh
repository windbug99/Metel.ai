#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[dashboard-v2-predeploy] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[dashboard-v2-predeploy] ERROR: OWNER_JWT, ADMIN_JWT, MEMBER_JWT are required"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[dashboard-v2-predeploy] ERROR: pnpm not found"
  exit 1
fi

echo "[dashboard-v2-predeploy] start"
echo "[dashboard-v2-predeploy] 1/4 frontend typecheck"
(cd "${FRONTEND_DIR}" && pnpm -s tsc --noEmit)

echo "[dashboard-v2-predeploy] 2/4 dashboard v2 qa stage gate"
API_BASE_URL="${API_BASE_URL}" \
OWNER_JWT="${OWNER_JWT}" \
ADMIN_JWT="${ADMIN_JWT}" \
MEMBER_JWT="${MEMBER_JWT}" \
REQUIRE_MOBILE_MANUAL_QA="${REQUIRE_MOBILE_MANUAL_QA:-1}" \
"${SCRIPT_DIR}/run_dashboard_v2_qa_stage_gate.sh"

echo "[dashboard-v2-predeploy] 3/4 rbac rollout stage gate (full_guard)"
MODE=full_guard \
API_BASE_URL="${API_BASE_URL}" \
OWNER_JWT="${OWNER_JWT}" \
ADMIN_JWT="${ADMIN_JWT}" \
MEMBER_JWT="${MEMBER_JWT}" \
"${SCRIPT_DIR}/run_rbac_rollout_stage_gate.sh"

echo "[dashboard-v2-predeploy] 4/4 rbac monitoring snapshot"
API_BASE_URL="${API_BASE_URL}" \
OWNER_JWT="${OWNER_JWT}" \
ADMIN_JWT="${ADMIN_JWT}" \
MEMBER_JWT="${MEMBER_JWT}" \
"${SCRIPT_DIR}/run_rbac_monitoring_snapshot.sh"

echo "[dashboard-v2-predeploy] PASS"
