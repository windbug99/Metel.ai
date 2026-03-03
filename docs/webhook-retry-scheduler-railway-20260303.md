# Webhook Retry Scheduler (Railway)

목적:
- `pending/retrying` 상태의 webhook delivery를 주기적으로 처리
- dead-letter 전환/알림을 자동화 운영으로 연결

실행 스크립트:
- `backend/scripts/process_webhook_retries.py`

## 로컬 실행 예시

```bash
cd backend
.venv/bin/python scripts/process_webhook_retries.py --limit 500
```

특정 사용자만 처리:

```bash
cd backend
.venv/bin/python scripts/process_webhook_retries.py --limit 200 --user-id <user_uuid>
```

## Railway Cron 설정 예시

Command:

```bash
cd backend && python scripts/process_webhook_retries.py --limit 500
```

Schedule(권장):
- `*/1 * * * *` (1분 주기) 또는
- `*/2 * * * *` (2분 주기)

필수 환경변수:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_RETRY_MAX_RETRIES`
- `WEBHOOK_RETRY_BASE_BACKOFF_SECONDS`
- `WEBHOOK_RETRY_MAX_BACKOFF_SECONDS`
- `DEAD_LETTER_ALERT_WEBHOOK_URL` (선택)
- `DEAD_LETTER_ALERT_MIN_COUNT` (선택)
