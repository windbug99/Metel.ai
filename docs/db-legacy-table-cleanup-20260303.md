# DB Legacy Table Cleanup (2026-03-03)

대상:
- `public.command_logs`
- `public.pending_actions`
- `public.pipeline_links`
- `public.pipeline_step_logs`

근거(현재 코드 기준):
- 운영 런타임 경로는 `users`, `oauth_tokens`, `api_keys`, `tool_calls`를 사용
- MCP Gateway / Execution Control API 라우트에서 위 4개 테이블 직접 참조 없음

적용 SQL:
- `docs/sql/018_drop_legacy_tables_phase3.sql`

실행 예시:
```sql
\i docs/sql/018_drop_legacy_tables_phase3.sql
```

주의:
- 아래 분석/운영 보조 스크립트는 과거 테이블(`command_logs`, `pipeline_links`, `pipeline_step_logs`)을 참조할 수 있음
  - 예: `backend/scripts/eval_*`, `backend/scripts/check_*` 일부
- 해당 스크립트를 계속 사용할 계획이면 테이블 삭제 전에 스크립트 정리/대체 필요
