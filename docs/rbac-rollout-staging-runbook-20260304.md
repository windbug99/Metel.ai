# RBAC Rollout Staging Runbook (2026-03-04)

목적:
- Staging에서 RBAC 가드를 `read_guard only`로 먼저 활성하고 영향도를 검증한다.

사전 조건:
- owner/admin/member JWT 3종 확보
- staging API URL 확보

## 1) Staging 환경변수 설정 (read-only guard 단계)

```bash
RBAC_READ_GUARD_ENABLED=true
RBAC_WRITE_GUARD_ENABLED=false
UI_RBAC_STRICT_ENABLED=false
```

적용 후 backend 재배포/재시작.

## 2) 적용 상태 검증

```bash
cd backend
API_BASE_URL=https://<staging-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
EXPECT_READ_GUARD=1 \
EXPECT_WRITE_GUARD=0 \
EXPECT_UI_STRICT=0 \
./scripts/run_rbac_rollout_smoke.sh
```

기대 결과:
- `/api/me/permissions.feature_flags`가 read=true/write=false/ui=false
- member의 admin read endpoint 접근은 `403`
- admin/member의 audit settings write는 `200` (write guard off 상태 확인)

또는 통합 게이트 스크립트 사용:

```bash
cd backend
MODE=read_only \
API_BASE_URL=https://<staging-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
./scripts/run_rbac_rollout_stage_gate.sh
```

## 3) 종료 기준

- 스모크 통과
- 대시보드 주요 조회 경로에 false-deny 이슈 없음
- access_denied 급증 여부 모니터링 이상 없음

## 4) 다음 단계 (write_guard 활성)

```bash
RBAC_WRITE_GUARD_ENABLED=true
UI_RBAC_STRICT_ENABLED=true
```

재배포 후 동일 스크립트를 아래 기대값으로 재실행:

```bash
EXPECT_READ_GUARD=1 EXPECT_WRITE_GUARD=1 EXPECT_UI_STRICT=1
```

통합 게이트 스크립트:

```bash
cd backend
MODE=full_guard \
API_BASE_URL=https://<staging-api-domain> \
OWNER_JWT=<owner_jwt> \
ADMIN_JWT=<admin_jwt> \
MEMBER_JWT=<member_jwt> \
./scripts/run_rbac_rollout_stage_gate.sh
```

기대 결과:
- `/api/me/permissions.feature_flags`가 read=true/write=true/ui=true
- member/admin의 owner-only write 접근이 `403`
- dashboard consistency role matrix 통과
