# Product analytics (webapp)

**Статус:** закрыта (2026-05-27), блоки 1–6.

## Канон

| Документ | Назначение |
|----------|------------|
| [`.cursor/plans/archive/product_analytics.plan.md`](../../.cursor/plans/archive/product_analytics.plan.md) | План и Definition of Done |
| [`LOG.md`](LOG.md) | Журнал исполнения и review-fixes |
| [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) | HTTP: `admin/product-analytics`, `patient/analytics/*`, `internal/product-analytics/retention` |
| [`apps/webapp/src/app/app/doctor/usage/page.tsx`](../../apps/webapp/src/app/app/doctor/usage/page.tsx) | Admin UI: «Использование» (`GET /api/admin/product-analytics`; legacy `?adminTab=product-analytics` → redirect) |
| [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) | Host cron: `POST /api/internal/product-analytics/retention` |

## Ingest (кратко)

- **`app_open` / `page_view` / `heartbeat`** — клиент `PatientAnalyticsReporter` → `POST /api/patient/analytics/events`.
- **`auth_login`** — после успешного входа в перечисленных auth routes (`recordAuthLogin`).
- **`POST /api/patient/pwa/launch`** — только **`heartbeat`** + metadata `pwa_launch_snapshot` (не `app_open`).
- **Push:** `product_push_notifications` при отправке; **`push_open`** из SW → `POST /api/patient/analytics/push-open` (dedupe по `trackingId`).

## Модуль

`apps/webapp/src/modules/product-analytics/` — ports, service, rollups; DI: `deps.productAnalytics` в `buildAppDeps`.
