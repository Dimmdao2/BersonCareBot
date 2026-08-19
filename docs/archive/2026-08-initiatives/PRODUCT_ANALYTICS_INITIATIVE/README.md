# Product analytics (webapp)

**Статус:** закрыта (2026-05-27), блоки 1–6.

## Канон

| Документ                                                                                                        | Назначение                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`.cursor/plans/archive/product_analytics.plan.md`](../../../.cursor/plans/archive/product_analytics.plan.md)      | План и Definition of Done                                                                                                        |
| [`LOG.md`](LOG.md)                                                                                              | Журнал исполнения и review-fixes                                                                                                 |
| [`apps/webapp/src/app/api/api.md`](../../../apps/webapp/src/app/api/api.md)                                        | HTTP: `admin/product-analytics`, `admin/auth-registration-events`, `patient/analytics/*`, `internal/product-analytics/retention` |
| [`apps/webapp/src/app/app/doctor/usage/page.tsx`](../../../apps/webapp/src/app/app/doctor/usage/page.tsx)          | Admin UI: «Использование» (`GET /api/admin/product-analytics`; legacy `?adminTab=product-analytics` → redirect)                  |
| [`deploy/HOST_DEPLOY_README.md`](../../../deploy/HOST_DEPLOY_README.md)                                            | Host cron: `POST /api/internal/product-analytics/retention`                                                                      |
| [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../legacy-underscore/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) § 2026-05-28 | Наблюдаемость cron в «Здоровье системы» (`operator_job_status` tick + UI `cronJobs`)                                             |

## Ingest (кратко)

- **`app_open` / `page_view` / `heartbeat`** — клиент `PatientAnalyticsReporter` → `POST /api/patient/analytics/events`.
- **`auth_login`** — после успешного входа в перечисленных auth routes (`recordAuthLogin`).
- **`auth_register_*`** — воронка регистрации из auth routes (`recordAuthRegistration`): attempt / success / failure; metadata без сырого PII; см. [`auth.md`](../../../apps/webapp/src/modules/auth/auth.md) §«Журнал воронки регистрации», admin list API в [`api.md`](../../../apps/webapp/src/app/api/api.md).
- **`POST /api/patient/pwa/launch`** — только **`heartbeat`** + metadata `pwa_launch_snapshot` (не `app_open`).
- **Push:** `product_push_notifications` при отправке; **`push_open`** из SW → authenticated patient
  `POST /api/patient/analytics/push-open` (dedupe по `trackingId`, запись только через current-patient DB seam).

## Исключение тестовых аккаунтов

- Дашборд «Использование» (`GET /api/admin/product-analytics`) читает `includeTestAccounts` из `loadProductAnalyticsAudience()` — тестовые попадают в агрегаты **только** при **`dev_mode`**; `debug_forward_to_admin` не влияет. См. [`DOCTOR_DASHBOARD_METRICS.md`](../../ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md).
- Журнал `auth_register_*` на `/app/doctor/audit-log` **всегда** без тестовых (операционный аудит).

## Admin UI (кроме «Использование»)

- **Ошибки регистрации:** `/app/doctor/audit-log` — `AdminAuthRegistrationEventsSection` → `GET /api/admin/auth-registration-events` (фильтры по eventType, errorClass, authMethod, preset).

## Модуль

`apps/webapp/src/modules/product-analytics/` — ports, service, rollups; DI: `deps.productAnalytics` в `buildAppDeps`.

## Отложенное расширение — owner decision 2026-08-14

Статус: **не реализовано; вернуться отдельным workstream после стабилизации RLS/grants**.

- Специалисту нужны два уровня аналитики: активность конкретного пациента и агрегат только по пациентам,
  закреплённым за этим специалистом. Атрибуция должна учитывать историю `patient_specialist_links`, чтобы
  перевод пациента не переносил прошлые показатели задним числом.
- Первый MVP может использовать уже имеющиеся `app_open`, `page_view`, `heartbeat`, push и playback-resolve
  события для метрик «открыл/не открыл» и активности. Текущие `videoPlaybackEstimatedWatchMinutes` не являются
  фактическим временем просмотра: они прибавляют полную длительность файла при resolve. Для watch time/
  процента досмотра нужны отдельные дедуплицированные progress/completed events.
- Global admin получает только обезличенные агрегаты клиник и платформы: активные клиники/пациенты, записи,
  визиты, назначенные программы, использование страниц/видео. Сырые `user_id`, имена, контакты и переходы в
  карту пациента ему не выдаются; малые когорты должны подавляться.
- Постоянного доступа техподдержки к клиническим данным нет. Возможный будущий support-access — отдельный
  явно разрешённый клиникой, повторно подтверждённый, ограниченный по пациенту/разделу/времени read-only режим
  с причиной и полным аудитом; это не часть текущего этапа.
