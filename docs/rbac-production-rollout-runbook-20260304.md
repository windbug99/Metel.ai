# RBAC Production Rollout Runbook (2026-03-04)

목적:
- Production에서 RBAC 가드 적용을 안전하게 전개하고 48시간 동안 이상 징후를 감시한다.

## 1) 시작 조건

- Staging `MODE=full_guard` 검증 통과
- `backend/scripts/run_phase3_rbac_smoke.sh` 최신 main 기준 green
- owner/admin/member JWT 준비 (운영 검증 전용)

## 2) Production 활성 순서

### Step A: owner/admin 우선 검증 윈도우 (배포 직후 1~2시간)

환경 변수:
```bash
RBAC_READ_GUARD_ENABLED=true
RBAC_WRITE_GUARD_ENABLED=true
UI_RBAC_STRICT_ENABLED=false
```

검증:
```bash
cd backend
MODE=full_guard \
API_BASE_URL=https://<prod-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
./scripts/run_rbac_rollout_stage_gate.sh
```

판정:
- 통과 시 Step B 진행
- 실패 시 즉시 `UI_RBAC_STRICT_ENABLED=false` 유지 + 원인 분석

### Step B: member 포함 최종 활성

환경 변수:
```bash
RBAC_READ_GUARD_ENABLED=true
RBAC_WRITE_GUARD_ENABLED=true
UI_RBAC_STRICT_ENABLED=true
```

재검증:
```bash
cd backend
MODE=full_guard \
API_BASE_URL=https://<prod-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
./scripts/run_rbac_rollout_stage_gate.sh
```

## 3) 48시간 모니터링

권장 주기:
- 0h, 1h, 2h, 6h, 12h, 24h, 36h, 48h

실행:
```bash
cd backend
API_BASE_URL=https://<prod-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
ALERT_ACCESS_DENIED_24H=50 \
ALERT_FAIL_RATE_24H=0.2 \
ALERT_POLICY_BLOCK_RATE=0.4 \
./scripts/run_rbac_monitoring_snapshot.sh
```

수동 실행 원칙:
- 각 체크포인트(0h, 1h, 2h, 6h, 12h, 24h, 36h, 48h)마다 위 1회 실행 명령을 동일하게 반복한다.
- 결과는 `docs/rbac-production-monitoring-log-20260305.md`의 `Checkpoints`/`Snapshot`/`모니터링 결과`에 즉시 기록한다.

관찰 지표:
- `access_denied_24h`
- `fail_rate_24h`
- `policy_override_usage_24h`
- false-deny probe (owner 200, admin/member 403)

## 4) 장애 대응/롤백

증상별 즉시 조치:
- owner 요청이 403으로 차단(false-deny): `UI_RBAC_STRICT_ENABLED=false`로 즉시 완화 후 원인 분석
- member 쓰기 요청이 200으로 허용(policy regression): 배포 버전 되돌림 또는 최근 권한 변경점 롤백
- `access_denied_24h` 급증: 조직/팀 membership 데이터 정합성 점검

핫픽스 후 재검증:
```bash
cd backend
./scripts/run_phase3_rbac_smoke.sh
MODE=full_guard API_BASE_URL=https://<prod-api-domain> OWNER_JWT=<owner_jwt> ADMIN_JWT=<admin_jwt> MEMBER_JWT=<member_jwt> ./scripts/run_rbac_rollout_stage_gate.sh
```
