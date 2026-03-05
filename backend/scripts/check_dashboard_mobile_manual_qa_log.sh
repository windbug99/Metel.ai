#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="${ROOT_DIR}/docs/dashboard-mobile-manual-qa-log-20260305.md"

if [[ ! -f "${LOG_FILE}" ]]; then
  echo "[mobile-manual-log] ERROR: missing ${LOG_FILE}"
  exit 1
fi

if grep -q -- "- \\[ \\]" "${LOG_FILE}"; then
  echo "[mobile-manual-log] FAIL: unchecked checklist items remain"
  exit 1
fi

if ! grep -Eq '종합 결과: `?(PASS|OK)`?' "${LOG_FILE}"; then
  echo "[mobile-manual-log] FAIL: summary result is not PASS/OK"
  exit 1
fi

echo "[mobile-manual-log] PASS"
