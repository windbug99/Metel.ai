#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env.stage}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[org-policy-env-run] ERROR: env file not found: ${ENV_FILE}"
  echo "[org-policy-env-run] hint: cp backend/.env.stage.example backend/.env.stage"
  exit 1
fi

while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  if [[ "${line}" != *"="* ]]; then
    continue
  fi
  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "${key}" | tr -d '[:space:]')"
  value="$(echo "${value}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  fi
  export "${key}=${value}"
done < "${ENV_FILE}"

if [[ -z "${API_BASE_URL:-}" || -z "${STAGING_DB_URL:-}" || -z "${ORG_ID:-}" || -z "${TEAM_ID:-}" || -z "${OWNER_JWT:-}" || -z "${ADMIN_JWT:-}" || -z "${MEMBER_JWT:-}" ]]; then
  echo "[org-policy-env-run] ERROR: missing required variables in ${ENV_FILE}"
  exit 1
fi

contains_placeholder() {
  local value="$1"
  [[ "${value}" == *"<"* || "${value}" == *">"* ]]
}

for key in API_BASE_URL STAGING_DB_URL ORG_ID TEAM_ID OWNER_JWT ADMIN_JWT MEMBER_JWT; do
  value="${!key}"
  if contains_placeholder "${value}"; then
    echo "[org-policy-env-run] ERROR: ${key} still has placeholder value in ${ENV_FILE}"
    exit 1
  fi
done

echo "[org-policy-env-run] env loaded from ${ENV_FILE}"
APPLY_MIGRATION="${APPLY_MIGRATION:-1}" \
RUN_PREDEPLOY_GATE="${RUN_PREDEPLOY_GATE:-1}" \
"${SCRIPT_DIR}/run_org_policy_rollout_stage_gate.sh"
