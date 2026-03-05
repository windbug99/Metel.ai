#!/usr/bin/env bash
set -euo pipefail

MODE="${MODE:-read_only}"

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "[rbac-stage-gate] ERROR: API_BASE_URL is required"
  exit 1
fi
if [[ -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[rbac-stage-gate] ERROR: OWNER_JWT, ADMIN_JWT, MEMBER_JWT are required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[rbac-stage-gate] MODE=${MODE}"

case "${MODE}" in
  read_only)
    echo "[rbac-stage-gate] 1/2 rollout smoke (read_only: read=1 write=0 ui=0)"
    API_BASE_URL="${API_BASE_URL}" \
    OWNER_JWT="${OWNER_JWT}" \
    ADMIN_JWT="${ADMIN_JWT}" \
    MEMBER_JWT="${MEMBER_JWT}" \
    EXPECT_READ_GUARD=1 \
    EXPECT_WRITE_GUARD=0 \
    EXPECT_UI_STRICT=0 \
    "${SCRIPT_DIR}/run_rbac_rollout_smoke.sh"

    echo "[rbac-stage-gate] 2/2 dashboard summary consistency (member baseline)"
    # In read_only mode we only validate member baseline formulas.
    # Explicitly clear role-matrix tokens to prevent full-guard-only assertions.
    env -u OWNER_JWT -u ADMIN_JWT -u MEMBER_JWT \
      API_BASE_URL="${API_BASE_URL}" \
      ENABLE_ROLE_MATRIX=0 \
      USER_JWT="${MEMBER_JWT}" \
      "${SCRIPT_DIR}/run_phase3_dashboard_consistency.sh"
    ;;
  full_guard)
    echo "[rbac-stage-gate] 1/2 rollout smoke (full_guard: read=1 write=1 ui=1)"
    API_BASE_URL="${API_BASE_URL}" \
    OWNER_JWT="${OWNER_JWT}" \
    ADMIN_JWT="${ADMIN_JWT}" \
    MEMBER_JWT="${MEMBER_JWT}" \
    EXPECT_READ_GUARD=1 \
    EXPECT_WRITE_GUARD=1 \
    EXPECT_UI_STRICT=1 \
    "${SCRIPT_DIR}/run_rbac_rollout_smoke.sh"

    echo "[rbac-stage-gate] 2/2 dashboard consistency role matrix"
    API_BASE_URL="${API_BASE_URL}" \
    OWNER_JWT="${OWNER_JWT}" \
    ADMIN_JWT="${ADMIN_JWT}" \
    MEMBER_JWT="${MEMBER_JWT}" \
    "${SCRIPT_DIR}/run_phase3_dashboard_consistency.sh"
    ;;
  *)
    echo "[rbac-stage-gate] ERROR: MODE must be read_only or full_guard"
    exit 1
    ;;
esac

echo "[rbac-stage-gate] done"
