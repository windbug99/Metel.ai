# RBAC Dashboard E2E Smoke Checklist (owner/admin/member)

작성일: 2026-03-04  
목적: 대시보드/권한 가드가 role(owner/admin/member)에 맞게 동작하는지 운영 직전 수동 스모크로 확인

## 1) 준비

- `API_BASE_URL`: 예) `https://<your-api-domain>`
- `OWNER_JWT`: owner 계정 액세스 토큰
- `ADMIN_JWT`: admin 계정 액세스 토큰
- `MEMBER_JWT`: member 계정 액세스 토큰

헬퍼:

```bash
api() {
  local token="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      "$API_BASE_URL$path" \
      -d "$body"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      "$API_BASE_URL$path"
  fi
}
```

## 2) 권한 스냅샷 확인 (/api/me/permissions)

1. `OWNER_JWT`로 호출
```bash
api "$OWNER_JWT" GET /api/me/permissions
```
기대:
- `role=owner`
- `permissions.can_read_admin_ops=true`
- `permissions.can_update_audit_settings=true`
- `permissions.can_manage_incident_banner=true`

2. `ADMIN_JWT`로 호출
```bash
api "$ADMIN_JWT" GET /api/me/permissions
```
기대:
- `role=admin`
- `permissions.can_read_admin_ops=true`
- `permissions.can_update_audit_settings=false`
- `permissions.can_manage_incident_banner=false`

3. `MEMBER_JWT`로 호출
```bash
api "$MEMBER_JWT" GET /api/me/permissions
```
기대:
- `role=member`
- `permissions.can_read_admin_ops=false`
- `permissions.can_manage_organizations=false`
- `permissions.can_manage_teams=false`
- `permissions.can_manage_integrations=false`

## 3) 핵심 권한 경계 스모크

1. Admin read endpoint (`/api/admin/external-health`)
- owner/admin: 200
- member: 403

```bash
api "$OWNER_JWT" GET "/api/admin/external-health?days=1"
api "$ADMIN_JWT" GET "/api/admin/external-health?days=1"
api "$MEMBER_JWT" GET "/api/admin/external-health?days=1"
```

2. Audit settings update (`PATCH /api/audit/settings`)
- owner: 200
- admin/member: 403

```bash
api "$OWNER_JWT" PATCH /api/audit/settings '{"retention_days":90,"export_enabled":true,"masking_policy":{"mask_keys":["token","secret"]}}'
api "$ADMIN_JWT" PATCH /api/audit/settings '{"retention_days":90}'
api "$MEMBER_JWT" PATCH /api/audit/settings '{"retention_days":90}'
```

3. Team create (`POST /api/teams`)
- owner/admin: 200
- member: 403

```bash
api "$OWNER_JWT" POST /api/teams '{"name":"smoke-owner-team","description":"rbac smoke"}'
api "$ADMIN_JWT" POST /api/teams '{"name":"smoke-admin-team","description":"rbac smoke"}'
api "$MEMBER_JWT" POST /api/teams '{"name":"smoke-member-team","description":"rbac smoke"}'
```

4. Webhook create (`POST /api/integrations/webhooks`)
- owner/admin: 200
- member: 403

```bash
api "$OWNER_JWT" POST /api/integrations/webhooks '{"name":"smoke-owner-webhook","endpoint_url":"https://example.com/hook","event_types":["tool_called"]}'
api "$ADMIN_JWT" POST /api/integrations/webhooks '{"name":"smoke-admin-webhook","endpoint_url":"https://example.com/hook","event_types":["tool_called"]}'
api "$MEMBER_JWT" POST /api/integrations/webhooks '{"name":"smoke-member-webhook","endpoint_url":"https://example.com/hook","event_types":["tool_called"]}'
```

## 4) 대시보드 UI 스모크 (수동)

1. owner 로그인
- `Admin / Ops` 메뉴 보임
- `Audit Settings` 저장 가능
- `Incident Banner` 저장/리뷰 버튼 동작
- 조직/팀/연동 쓰기 버튼 동작

2. admin 로그인
- `Admin / Ops` 메뉴 보임
- `Audit Settings` 저장 비활성(안내문구 노출)
- `Incident Banner` 저장/리뷰 비활성(안내문구 노출)
- 조직/팀/연동 쓰기 버튼 동작

3. member 로그인
- `Admin / Ops` 메뉴 숨김
- 조직/팀/연동 쓰기 버튼 비활성(read-only 안내문구 노출)
- 권한 없는 액션 시 403 전역 배너 노출

## 5) 합격 기준

- role별 권한 API(`/api/me/permissions`) 값이 기대와 일치
- owner/admin/member 핵심 경계 endpoint가 기대 status code를 반환
- 대시보드 메뉴/버튼 노출과 비활성 정책이 role별로 일치
- 권한 없는 호출에서 403 안내 UX가 일관되게 노출
