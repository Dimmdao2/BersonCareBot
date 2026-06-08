# Product analytics (webapp)

**Статус:** закрыта (2026-05-27), блоки 1–6.

## Канон

| Документ | Назначение |
|----------|------------|
| [`.cursor/plans/archive/product_analytics.plan.md`](../../.cursor/plans/archive/product_analytics.plan.md) | План и Definition of Done |
| [`LOG.md`](LOG.md) | Журнал исполнения и review-fixes |
| [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) | HTTP: `admin/product-analytics`, `admin/auth-registration-events`, `patient/analytics/*`, `internal/product-analytics/retention` |
| [`apps/webapp/src/app/app/doctor/usage/page.tsx`](../../apps/webapp/src/app/app/doctor/usage/page.tsx) | Admin UI: «Использование» (`GET /api/admin/product-analytics`; legacy `?adminTab=product-analytics` → redirect) |
| [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) | Host cron: `POST /api/internal/product-analytics/retention` |
| [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) § 2026-05-28 | Наблюдаемость cron в «Здоровье системы» (`operator_job_status` tick + UI `cronJobs`) |

## Ingest (кратко)

- **`app_open` / `page_view` / `heartbeat`** — клиент `PatientAnalyticsReporter` → `POST /api/patient/analytics/events`.
- **`auth_login`** — после успешного входа в перечисленных auth routes (`recordAuthLogin`).
- **`auth_register_*`** — воронка регистрации из auth routes (`recordAuthRegistration`): attempt / success / failure; metadata без сырого PII; см. [`auth.md`](../../apps/webapp/src/modules/auth/auth.md) §«Журнал воронки регистрации», admin list API в [`api.md`](../../apps/webapp/src/app/api/api.md).
- **`POST /api/patient/pwa/launch`** — только **`heartbeat`** + metadata `pwa_launch_snapshot` (не `app_open`).
- **Push:** `product_push_notifications` при отправке; **`push_open`** из SW → `POST /api/patient/analytics/push-open` (dedupe по `trackingId`).

## Исключение тестовых аккаунтов

- Дашборд «Использование» (`GET /api/admin/product-analytics`) читает `includeTestAccounts` из `loadProductAnalyticsAudience()` — тестовые попадают в агрегаты **только** при **`dev_mode`**; `debug_forward_to_admin` не влияет. См. [`DOCTOR_DASHBOARD_METRICS.md`](../ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md).
- Журнал `auth_register_*` на `/app/doctor/audit-log` **всегда** без тестовых (операционный аудит).

## Admin UI (кроме «Использование»)

- **Ошибки регистрации:** `/app/doctor/audit-log` — `AdminAuthRegistrationEventsSection` → `GET /api/admin/auth-registration-events` (фильтры по eventType, errorClass, authMethod, preset).

## Модуль

`apps/webapp/src/modules/product-analytics/` — ports, service, rollups; DI: `deps.productAnalytics` в `buildAppDeps`.
