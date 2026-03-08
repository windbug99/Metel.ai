#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_MIGRATION="${APPLY_MIGRATION:-0}"
RUN_PREDEPLOY_GATE="${RUN_PREDEPLOY_GATE:-0}"

if [[ "${APPLY_MIGRATION}" == "1" ]]; then
  echo "[org-policy-stage-gate] 1/5 apply migration 032"
  "${SCRIPT_DIR}/apply_org_policy_migration_032.sh"
else
  echo "[org-policy-stage-gate] 1/5 apply migration 032 skipped (set APPLY_MIGRATION=1)"
fi

echo "[org-policy-stage-gate] 2/5 validate test tokens"
"${SCRIPT_DIR}/validate_rbac_test_tokens.sh"

echo "[org-policy-stage-gate] 3/5 org policy scope smoke"
"${SCRIPT_DIR}/run_org_policy_scope_smoke.sh"

if [[ "${RUN_PREDEPLOY_GATE}" == "1" ]]; then
  echo "[org-policy-stage-gate] 4/5 dashboard v2 predeploy gate"
  "${SCRIPT_DIR}/run_dashboard_v2_predeploy_gate.sh"
else
  echo "[org-policy-stage-gate] 4/5 dashboard v2 predeploy gate skipped (set RUN_PREDEPLOY_GATE=1)"
fi

echo "[org-policy-stage-gate] 5/5 rbac monitoring snapshot"
"${SCRIPT_DIR}/run_rbac_monitoring_snapshot.sh"

echo "[org-policy-stage-gate] PASS"
