# Execution log — Operator Health & Alerting

Журнал исполнения инициативы. Записи добавляются по мере работы.

## Записи

### 2026-05-15 — System health: `integrator_push_outbox` + guard tick (**закрыто**)

Канонический план (закрыт): [`.cursor/plans/archive/admin_db_guard_monitoring.plan.md`](../../.cursor/plans/archive/admin_db_guard_monitoring.plan.md).

- **Снимок:** `OperatorHealthReadPort.getIntegratorPushOutboxHealth` → `pgOperatorHealthRead.ts` (Drizzle, один `Promise.all`). **`oldestDueAgeSeconds`**: для due-pending (`status=pending` AND `next_try_at<=now()`) берётся строка с **минимальным** `next_try_at` (порядок `ASC`), возраст = **секунды от этого timestamp до `Date.now()`** (насколько «просрочен» самый старый слот ретрая). **`oldestProcessingAgeSeconds`**: при `processing` — `now - min(updated_at)` по строкам `processing`.
- **Пороги:** `integratorPushOutboxHealth.ts`; due-warning = **`ADMIN_DELIVERY_DUE_BACKLOG_WARNING`** (тот же числовой порог, что исходящая доставка). **`deadTotal > 0` → `error`** (жёстче, чем probe только по dead у `outgoing_delivery` — осознанно для синка в integrator).
- **API/UI:** `GET /api/admin/system-health` + `meta.probes.integratorPushOutbox`; карточка «Очередь синка в integrator» в `SystemHealthSection.tsx`.
- **Баннер врача:** `adminDoctorTodayHealthBannerFromSystemHealth` — тот же `classifyIntegratorPushOutboxSystemHealthStatus`.
- **Аудит:** `writeAuditLogDedupeOpenConflictKey`, `action: system_health_integrator_push_outbox`, `conflict_key`: `system_health:ipo:<UTC YYYY-MM-DDTHH>:s<rank>` (rank 1=degraded, 2=error).
- **Relay:** топик **`system_health_db_guard`** в `admin_incident_alert_config` (дефолт **false**); **`POST /api/internal/system-health-guard/tick`** с Bearer **`INTERNAL_JOB_SECRET`** (тот же паттерн, что остальные internal cron — **без** отдельного ключа в `system_settings` для секрета tick). Оркестрация: `runIntegratorPushOutboxHealthGuardTick.ts`.
- **Проверки:** `pnpm --filter @bersoncare/webapp run test:inprocess -- src/app/api/admin/system-health/route.test.ts src/app/api/internal/system-health-guard/tick/route.test.ts src/modules/operator-health/integratorPushOutboxHealth.test.ts`; RTL `SystemHealthSection.*.test.tsx` при правках UI. Перед merge — полный **`pnpm run ci`** из корня репозитория.

### 2026-05-15 — Admin incident alerts (identity relay)

- Реализация и доки синхронизированы; закрытый план: [`.cursor/plans/archive/admin_incident_alerts.plan.md`](../../.cursor/plans/archive/admin_incident_alerts.plan.md) (миграции webapp **`0064`**, integrator **`20260515_0001`**). См. также шапку [`README.md`](README.md) и [`PHASE_D_EVENT_HOOKS.md`](PHASE_D_EVENT_HOOKS.md) §8 (in-app merge/purge — backlog).

### 2026-05-14 — Док: PHASE G не блокирует закрытый MVP

- **`PHASE_G_TESTS_AND_DOCS.md`**: в шапке зафиксировано, что **MVP** закрыт по `MVP_IMPLEMENTATION_PLAN.md`; чеклисты фазы G — пост-MVP полировка; G.1 помечен как **defer** с отсылкой к `LOG.md` / MVP DoD.

### 2026-05-14 — Синхронизация оглавлений документации (system-health / reconcile)

- **`docs/README.md`** — хаб: reconcile cron, `collectAdminSystemHealthData`, `adminHealthThresholds`, ссылки на план и `HLS_RECONCILE_METRICS_LOG`.
- **`README.md` / `MASTER_PLAN.md`** (эта папка) — актуальный состав `GET /api/admin/system-health` и пути в репо.
- **`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`** — в списке admin-ключей VIDEO_HLS добавлен **`video_hls_reconcile_enabled`**.
- **`docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/README.md`** — строка таблицы на **`HLS_RECONCILE_METRICS_LOG.md`**.

### 2026-05-14 — Cron reconcile + транскод в админском health (план `cron_and_system_health`)

- **Internal:** `POST /api/internal/media-transcode/reconcile` — тик в **`public.operator_job_status`** (`job_family=media`, `job_key=media_transcode.reconcile`) best-effort; **`OperatorHealthWritePort`** + DI; константы в `reconcileJobKeys.ts`.
- **API/UI:** расширенный **`videoTranscode`** в `GET /api/admin/system-health` (24h/lifetime, backlog reconcile по DRY-предикату из `videoHlsLegacyBackfill`, **`lastReconcileTick`**); вкладка `SystemHealthSection`.
- **Деплой:** два режима cron в **`deploy/HOST_DEPLOY_README.md`** (`*/10` + nightly Москва **`0 4 * * *`**); отдельный реестр в **`SERVER CONVENTIONS`** по плану не вводился.
- **Интегратор:** миграция **`core:20260513_0001_video_hls_reconcile_enabled.sql`** — сид **`video_hls_reconcile_enabled`** в `system_settings`.
- **Пост-аудит UI:** блок «Техническая диагностика» маркером **`SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID`**; RTL **`SystemHealthSection.primaryLayerInvariants.test.tsx`**; русские подписи машинных статусов на сводке и для БД integrator на карточке.
- **Пороги транскода в health:** `videoTranscode.status` — **`ok` \| `degraded` \| `error`** через **`classifyVideoTranscodeSystemHealthStatus`** (`adminHealthThresholds.ts`); unit **`adminHealthThresholds.test.ts`**, кейсы в **`system-health/route.test.ts`**.
- **Аудит документации:** выровнен текст **`.cursor/plans/archive/cron_and_system_health.plan.md`** (§5/§8/DoD, фактическое состояние: webapp **0056**, `degraded`, исторический UI-аудит); **`HLS_RECONCILE_METRICS_LOG.md`** — пороги и расширенная команда vitest.
- Трекер: **`.cursor/plans/archive/cron_and_system_health.plan.md`**.

### 2026-05-14 — Общая очередь доставки (`outgoing_delivery_queue`)

- Операторские TG-алерты и `reminders.dispatchDue` переведены на `public.outgoing_delivery_queue`; доставка и ретраи в integrator worker (`outgoingDeliveryWorker`).
- Webapp: `OperatorHealthReadPort.getOutgoingDeliveryQueueHealth`, `GET /api/admin/system-health` (`outgoingDelivery`), UI в `SystemHealthSection`; admin-only баннер на экране врача «Сегодня»; для `role === admin` admin mode считается всегда включённым (`requireAdminModeSession`, сессия, настройки).
- Док: `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md`.

### 2026-05-14 — Аудит: доработка health, баннера и классификации dispatch

- Сбор `GET /api/admin/system-health` вынесен в `collectAdminSystemHealthData`; баннер «Сегодня» использует тот же снимок (`adminDoctorTodayHealthBannerFromSystemHealth`).
- Метрики очереди: `dueByChannel`, `processingCount`, `lastSentAt`, `lastQueueActivityAt`; UI в `SystemHealthSection`.
- Integrator: `isOutgoingDeliveryDispatchErrorRetryable` + ретраи `enqueueReminderDispatchBatchWithRetries`; документ `docs/ARCHITECTURE/OUTGOING_DISPATCH_CLASSIFICATION.md`; план `.cursor/plans/archive/reliable_delivery_queue_audit_followup.plan.md`.

### 2026-05-03 — Декомпозиция фаз

- Добавлены детальные планы **PHASE_A** … **PHASE_G** (шаги, checklist, scope, DoD по фазе); `MASTER_PLAN.md` §5 заменён на таблицу ссылок.
- Код не менялся.

### 2026-05-13 — MVP implementation plan

- Добавлен [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md): уточнения после проверки кода (дедуп GCal **без** `recordId` в ключе, хуки в **postCreate + webhook**, таблица в **`public`**, защита probe, resolution MVP A/B, риски).
- Cursor: единый трекер `~/.cursor/plans/mvp_operator_health_alerting_9310cffe.plan.md` (дубликат `mvp_operator_health_alerting_638ba46f.plan.md` снят); канон по шагам — `MVP_IMPLEMENTATION_PLAN.md` в репо.
- План дополнительно усилен до исполняемого формата: fixed decisions, строгие scope boundaries, data contract (`public.operator_incidents`), `error_class` taxonomy, пошаговые локальные проверки и явный минимальный auto-resolve для probe-инцидентов.

### 2026-05-14 — Док-синхронизация MVP + таймаут MAX-пробы

- `MVP_IMPLEMENTATION_PLAN.md`: DoD §7 и §10 выровнены с фактом наличия cron/systemd инструкций в `deploy/HOST_DEPLOY_README.md` и `docs/ARCHITECTURE/SERVER CONVENTIONS.md`; уточнены §4.3/`job_key`, scope (`drizzle-migrations`, `packages/operator-db-schema`, `deploy/host/operator-health-probe.sh`), E2 проверки, A2/C1/E3 формулировки; таблица рисков — строка про отсутствие ретрая TG при сбое dispatch.
- Integrator: `operatorHealthProbeRunner` — верхняя граница ожидания `getMaxBotInfo` (15s wall-clock), тест на timeout.
- Cursor-трекер `mvp_operator_health_alerting_9310cffe.plan.md`: убраны устаревшие формулировки про «нет сниппета» / «не найден concurrency unit».

### 2026-05-14 — Cursor plans: слияние

- Оставлен один трекер `mvp_operator_health_alerting_9310cffe.plan.md`; удалён дубликат `638ba46f`; статусы todos и DoD в `MVP_IMPLEMENTATION_PLAN.md` синхронизированы с кодом (host cron/systemd для probe + unit `openOrTouch` закрыты в репо).

### 2026-05-13 — Integrator: Drizzle для новых operator-таблиц

- Введён workspace-пакет **`@bersoncare/operator-db-schema`**: единая Drizzle-схема `operator_incidents` / `operator_job_status` для **webapp** (реэкспорт из `apps/webapp/db/schema/operatorHealth.ts`) и **integrator**.
- Integrator: `getIntegratorDrizzle()` (`apps/integrator/src/infra/db/drizzle.ts`) на общем `pg` pool + репозиторий `operatorHealthDrizzle.ts` (insert/onConflict/update через Drizzle, без сырого SQL в коде приложения).
- `scripts/ensure-booking-sync-built.sh` и цепочки `build`/`typecheck` дополнены сборкой пакета схемы.

### 2026-05-13 — Webapp system-health + backup script (MVP D1 / E1–E2)

- Webapp: порт `OperatorHealthReadPort`, `pgOperatorHealthRead` / in-memory, `buildAppDeps().operatorHealthRead`; `GET /api/admin/system-health` — поля **`operatorIncidentsOpen`**, **`backupJobs`**, пробы **`meta.probes.operatorIncidents`** / **`operatorBackupJobs`**; UI в `SystemHealthSection` + тесты (`route.test`, `SystemHealthSection.operatorIncidents.test.tsx`).
- Integrator: `POST /internal/operator-health-probe` в `routes.ts`; тесты `operatorHealthProbeRoute.test.ts`, мок **`reportOperatorFailure`** в `postCreateProjection.test.ts`.
- Deploy: `postgres-backup.sh` — **`weekly`**, **`prune`**, один `pg_dump` при совпадении `DATABASE_URL`, retention и тики **`public.operator_job_status`** через `psql`; обновлены `deploy/postgres/README.md`, `deploy/HOST_DEPLOY_README.md`, `apps/webapp/src/app/api/api.md`.

### 2026-05-13 — Аудит MVP: backup family + тесты + доки

- **Контракт БД для бэкапов:** `job_family=backup`, `job_key` = `backup.hourly` | `backup.daily` | `backup.weekly` | `backup.pre_migrations` | `backup.manual` | `backup.prune`; скрипт `postgres-backup.sh` и чтение в webapp выровнены; миграция **`0058_operator_job_status_backup_family`** приводит legacy-строки (`postgres_backup`, короткие ключи).
- **Webapp:** порт чтения — метод **`listBackupJobStatus`** (фильтр `job_family = 'backup'`).
- **Integrator:** unit-тесты **`operatorHealthDrizzle.resolve.test.ts`** (resolve по префиксу), **`operatorHealthProbeRunner.test.ts`** (MAX/Rubitime ok/fail/skip), **`webhook.operatorIncident.test.ts`** (GCal sync fail → `reportOperatorFailure`).

### 2026-05-13 — Хвост MVP: openOrTouch unit + host probe

- Добавлен unit [`operatorHealthDrizzle.openOrTouch.test.ts`](../../apps/integrator/src/infra/db/repos/operatorHealthDrizzle.openOrTouch.test.ts) (цепочка insert/onConflict + sequential touch).
- Добавлен [`deploy/host/operator-health-probe.sh`](../../deploy/host/operator-health-probe.sh); операционное описание cron/systemd в [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md).
