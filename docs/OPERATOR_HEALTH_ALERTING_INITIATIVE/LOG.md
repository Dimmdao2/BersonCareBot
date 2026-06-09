# Execution log — Operator Health & Alerting

Журнал исполнения инициативы. Записи добавляются по мере работы.

## Записи

### 2026-06-09 — Wave 2: scope decisions + усиление ROADMAP (**постановка**)

- **Продукт:** critical immediate (матрица §3); digest 1×/день `digestTime` (default 09:00); не push на каждый `degraded`; account_conflicts один чекбокс; probe 3-strike; webhook burst 5/15m.
- **Архитектура:** `dispatchOperatorAlert`; `operator_health_alert_config`; каналы **отдельно** у critical / digest / account_conflicts; dedup table; облегчённый critical collect.
- **Доки:** [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md), [`ROADMAP_WAVE2.md`](ROADMAP_WAVE2.md) (волны 0–4, DoD, правила агентов); MASTER §supersede; PHASE E superseded; README таблица фаз.
- **Код:** не менялся.
- **Уточнение продукта:** один чекбокс «Конфликты аккаунтов»; доставка только через существующий worker/очередь, без новых сервисов; health UI ≠ срочный push — зафиксировано как правило (не открытый вопрос).
- **2026-06-09 (2):** сводка **1×/день**, поле `digestTime` default **09:00**; каналы TG/Max/Push **отдельно** у каждого из трёх блоков; очередь синка integrator — в «Критичные сбои», без отдельного чекбокса.

### 2026-06-09 — Wave 0 (фундамент) **закрыто в коде**

- **`dispatchOperatorAlert`** (`apps/webapp/src/modules/operator-alerts/`), dedup **`operator_health_alert_sent`** (миграция `0111`), порт `pgOperatorHealthAlertSent`.
- Ключ **`operator_health_alert_config`** в `ALLOWED_KEYS` + PATCH `/api/admin/settings`; lazy merge из `admin_incident_alert_config`.
- UI **«Уведомления админу»** (`OperatorHealthAlertsSection`) — три блока, свои каналы, `digestTime` default 09:00.
- `sendAdminIncidentRelayAlert` → thin wrapper; guard tick (на момент W0 — critical ipo; **с W1 audit:** только purge + классификация, push в `operator-health-critical/tick`).
- Integrator **`reportOperatorFailure`**: списки `admin_telegram_ids` / `admin_max_ids`, `channels.critical` из DB (без `adminTelegramId`).
- Cron templates: `deploy/host/cron.d/bersoncarebot-operator-health-{critical,digest}.cron.template`, `bersoncarebot-system-health-guard.cron.template`.
- Проверки: `operatorHealthAlertConfig.test.ts`, `dispatchOperatorAlert.test.ts`, `route.test.ts` (operator_health_alert_config).

### 2026-06-09 — Wave 1 аудит-фиксы

- **`videoTranscode` `error`:** critical + баннер (матрица §3); lightweight collect в `collectCriticalHealthSignals`.
- **Sync-баннер:** `probeOutbound.consecutiveFailRuns` в `SystemHealthResponse` + `videoTranscode.status` в mapper.
- **Guard tick:** только классификация ipo + TTL purge архива; critical push по ipo — только `operator-health-critical/tick` (убрано дублирование).
- **Тесты:** `runOperatorHealthCriticalTick` (dedup), `runIntegratorPushOutboxHealthGuardTick`, `operatorHealthDrizzle.recordProbeRun`, расширены classifier/banner/probe-runner.

### 2026-06-09 — Wave 2 (суточная сводка) **закрыто в коде**

- **`buildOperatorHealthDigest`** (`modules/operator-health/`): окно с прошлой сводки (или 24 ч); audit errors, incidents opened/resolved, job failures, snapshot (ongoing critical через `classifyCriticalHealthSignals` + non-critical degraded); `⚠️`/`✅`, ≤15 строк, ссылка `/app/doctor/system-health`; recovery без строки после `operator_incidents_resolve_all` в окне.
- **`runOperatorHealthDigestTick`** + **`POST /api/internal/operator-health-digest/tick`**; dedup `digest:{YYYY-MM-DD}`; cron registry `operator_health.digest.daily` (`health.operator_health_digest.tick`).
- **Порты:** `OperatorHealthDigestReadPort` (`pgOperatorHealthDigestRead`); dedup `getLatestSentAtByDedupKeyPrefix('digest:')`.
- **UI:** `SystemHealthSection` — «Последняя сводка: …» из `operatorHealthDigest.lastSentAt` в `GET /api/admin/system-health`.
- **Проверки:** `buildOperatorHealthDigest.test.ts`, `extractDigestDegradedLines.test.ts`, `digestHealthSnapshotLines.test.ts`, `digestSchedule.test.ts`, `runOperatorHealthDigestTick.test.ts`, `operator-health-digest/tick/route.test.ts`, `SystemHealthSection.operatorHealthDigest.test.tsx`; `pnpm --dir apps/webapp typecheck`.

### 2026-06-09 — Wave 2 аудит-фиксы

- **Snapshot critical в сводке:** `buildDigestHealthSnapshotLines` — ongoing critical (матрица §3) + non-critical degraded; устранён ложный `✅` при длительном critical без событий в окне.
- **`digestTime` PATCH:** только целый час (`:00`) — согласовано с cron `0 * * * *`.
- **Тесты:** truncation ≤15 строк, incidents/jobs, `disabled`, `extractDigestDegradedLines`, `digestSchedule`, critical snapshot.
- **Доки:** ROADMAP §6 чеклисты [x]; путь digest build в таблице §2.
- **Ops (не подтверждено на prod):** шаблон `bersoncarebot-operator-health-digest.cron.template` в репо; установка на хост — manual/deploy-prod (см. HOST_DEPLOY_README).

### 2026-06-09 — Wave 2 верификация пост-аудита

- **`digestTime` read/runtime:** `normalizeDigestTimeHour` при parse + `normalizeDigestTimeSlot` в `isDigestSendSlot` (legacy `09:30` → слот `09:00`).
- **UI:** `step={3600}`, нормализация часа при вводе и save.
- **Поле digest input:** `degradedLines` → `snapshotLines` в `OperatorHealthDigestInput`.
- **Дедуп строк:** при probe 3-strike не дублируется «Открытые инциденты».
- **Проверки:** 37 targeted vitest W2; `typecheck` ok.

### 2026-06-09 — Wave 1 (critical tick) **закрыто в коде**

- **`criticalHealthSignals.ts`:** `classifyCriticalHealthSignals`, `classifyOperatorHealthBannerSignals` (единые пороги §3); projection critical по `deadCount`, retries — banner-only; due backlog — banner-only; ipo `error` — critical, `degraded` — нет; probe **3-strike** (`PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS=3`).
- **`collectCriticalHealthSignals` / `collectOperatorHealthBannerInput`** — облегчённый сбор в `app-layer/health`.
- **`runOperatorHealthCriticalTick`** + **`POST /api/internal/operator-health-critical/tick`** (`INTERNAL_JOB_SECRET`); cron registry `operator_health_critical`.
- **`adminDoctorTodayHealthBanner`** — banner через shared classifier + `loadAdminDoctorTodayHealthBanner`.
- **Integrator probe 3-strike:** `recordOperatorOutboundProbeRun` в `operator_job_status` (`meta_json.consecutiveFailRuns`); `reportOperatorFailure` — без немедленного TG/Max для `max_probe_failed` / `rubitime_get_schedule_failed`.
- **Проверки:** `criticalHealthSignals.test.ts`, `operator-health-critical/tick/route.test.ts`, `adminDoctorTodayHealthBanner.test.ts`, `reportOperatorFailure.test.ts`; `pnpm --dir apps/webapp typecheck`.

### 2026-06-09 — Wave 0 аудит и фиксы

- **`reportOperatorFailure`:** исправлен shadowing — в `payloadJson.incidentId` попадал telegram recipient вместо UUID инцидента.
- **`dispatchOperatorAlert`:** dedup пишется только при фактической попытке доставки (`anyChannelAttempted`), не при `no_recipients`.
- Комментарии guard tick / HOST_DEPLOY — `operator_health_alert_config` critical вместо legacy `system_health_db_guard`.
- RTL: `OperatorHealthAlertsSection.test.tsx`; integrator: `reportOperatorFailure.test.ts`.
- **Следующий шаг:** волна 0 по ROADMAP §4.

### 2026-06-07 — UI: операторский сброс инцидентов и dead-очередей (**закрыто**)

План: [`.cursor/plans/archive/health_ui_operator_actions.plan.md`](../../.cursor/plans/archive/health_ui_operator_actions.plan.md).

#### Реализация

- **Цель:** оператор в «Здоровье системы» (`/app/doctor/system-health`, admin mode) закрывает открытые `operator_incidents` и архивирует dead в `projection_outbox` / `reminder_dispatch` без `psql`.
- **API:** `POST /api/admin/operator-incidents/resolve-all` → `{ ok, resolved }`, audit **`operator_incidents_resolve_all`**; расширен `POST /api/admin/health-failure-archive/clear` и `GET /api/admin/health-failure-archive` — пробы **`projection_outbox`**, **`outgoing_reminder_dispatch`** (+ `outgoing_delivery`, `integrator_push_outbox`).
- **Write:** `OperatorHealthWritePort.resolveAllOpenIncidents` — [`pgOperatorHealthWrite.ts`](../../apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts); архив — [`pgHealthFailureArchive.ts`](../../apps/webapp/src/infra/repos/pgHealthFailureArchive.ts) (`archiveProjectionDeadBatch`, `archiveOutgoingReminderDeadBatch`).
- **UI:** [`SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx) — «Закрыть все открытые», «Заархивировать и сбросить dead» (projection, reminders); union Dialog `HealthOperatorAction`; deep links на `?adminTab=health-archive&probe=…`.
- **Архив UI:** [`HealthFailureArchiveSection.tsx`](../../apps/webapp/src/app/app/settings/HealthFailureArchiveSection.tsx) — 4 probe в селекте; `archiveRowTypeLabel` / `archiveRowReasonLabel` (projection: `event_type`, `rawErrorTruncated`).
- **Audit:** фильтр действия `operator_incidents_resolve_all` в [`AdminAuditLogSection.tsx`](../../apps/webapp/src/app/app/settings/AdminAuditLogSection.tsx); пресет «Системные снимки» — [`ADMIN_AUDIT_SYSTEM_HEALTH_OPERATOR_ACTIONS`](../../apps/webapp/src/modules/admin/adminAuditListQuery.ts) + `systemHealthScopeOnly` в [`adminAuditLog.ts`](../../apps/webapp/src/infra/adminAuditLog.ts).

#### Сознательно не делали

- Recovery TG/email при ручном resolve инцидентов
- Requeue projection dead (ops: [`requeue-projection-outbox-dead.ts`](../../apps/webapp/scripts/requeue-projection-outbox-dead.ts))
- Resolve по одному `incident.id`
- Изменения `GET /api/doctor/health-failure-archive`

#### Проверки

- Route: `operator-incidents/resolve-all`, `health-failure-archive/clear`, `health-failure-archive` GET, `audit-log` (`systemHealthOnly`)
- Unit/query: `adminAuditListQuery`, `adminAuditLog` (`systemHealthScopeOnly` SQL)
- RTL: `SystemHealthSection.healthFailureArchive.test.tsx`, `SystemHealthSection.operatorIncidents.test.tsx` (Dialog → POST → reload)
- UI helpers: `HealthFailureArchiveSection.test.tsx`
- Unit `clearDeadForProbe` — в `health-failure-archive/clear/route.test.ts` (отдельный `healthFailureArchiveService.test.ts` **не** используется: моки с `deleted > 0` без второго батча → бесконечный цикл → OOM vitest)
- `pnpm --dir apps/webapp typecheck` — ok; targeted vitest **30+** green; webapp shard **2/3** — 1824 passed

#### Документация

- [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — `resolve-all`, `clear.probe`, `systemHealthOnly`
- План archived, DoD/checklists `[x]` — `.cursor/plans/archive/health_ui_operator_actions.plan.md`
- README инициативы — § операторские действия UI

### 2026-05-28 — Наблюдаемость host cron в «Здоровье системы»

- **Цель:** видеть в админке статус всех критичных periodic jobs (internal HTTP + backup tiers) без чтения `/var/log` на хосте.
- **Реестр:** [`apps/webapp/src/modules/operator-health/cronJobRegistry.ts`](../../apps/webapp/src/modules/operator-health/cronJobRegistry.ts) — `job_family` / `job_key`, `scheduleHint`, SLA `staleAfterSec` (классификатор [`classifyOperatorCronJobHealthStatus.ts`](../../apps/webapp/src/modules/operator-health/classifyOperatorCronJobHealthStatus.ts)).
- **Запись tick:** универсальный upsert [`recordOperatorJobTickSuccess` / `recordOperatorJobTickFailure`](../../apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts) через [`recordOperatorCronJobTickBestEffort`](../../apps/webapp/src/app-layer/operator-health/recordOperatorCronJobTick.ts). Ранее тики были только у reconcile, web-push-only tick и backup-скрипта.
- **Internal routes с tick (добавлено):** `media-pending-delete/purge`, `media-multipart/cleanup`, `media-preview/process`, `media-playback-stats/retention`, `media-hls-proxy-errors/retention`, `product-analytics/retention`, `system-health-guard/tick` (плюс уже существующие reconcile и `reminders/web-push-only/tick`).
- **API:** `GET /api/admin/system-health` → поле **`cronJobs`** ([`collectCronJobsHealth.ts`](../../apps/webapp/src/app-layer/health/collectCronJobsHealth.ts)); проба **`meta.probes.cronJobs`**.
- **UI:** `/app/doctor/system-health` — аккордеон **«Cron-задачи хоста»** в [`SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx) (последний успех / ошибка / расписание по задаче).
- **Документация:** [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) (admin/system-health, internal retention), [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) §Host cron, [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) (`INTERNAL_JOB_SECRET`).
- **Проверки:** `classifyOperatorCronJobHealthStatus.test.ts`, `collectCronJobsHealth.test.ts`, `system-health/route.test.ts`, retention route tests (мок tick), `typecheck` webapp.

**Ops (prod):** после deploy каждый настроенный cron при первом успешном/ошибочном прогоне появится в UI; до первого прогона — `no_data` по задаче. Smoke tick без DELETE: `POST …/product-analytics/retention?dryRun=1` (см. HOST_DEPLOY).

### 2026-05-18 — `remindersPipeline`: M2M idempotency + `deliveryEvents`

- Поле **`patientReminderM2mIdempotencyKeysActive`**: число неистёкших строк **`idempotency_keys`** с ключом **`LIKE 'prn:%:channels'`** (`expires_at > now()`), индикатор «ответ M2M на fan-out ещё в TTL» для web push + email.
- Тип **`RemindersPipelineHealthPayload`** / пустой fallback включают **`deliveryEvents`** (агрегат **`reminder_delivery_events`** за 24 ч UTC, sent/failed) наряду с **`occurrenceHistory`**.
- UI: строка метрики в аккордеоне «Напоминания» [`SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx); реализация — [`adminReminderPipelineMetrics.ts`](../../apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts).

### 2026-05-17 — Напоминания: `remindersPipeline` в system-health + вкладка «Статистика»

- **Health:** `GET /api/admin/system-health` расширен полем **`remindersPipeline`** и пробой **`meta.probes.remindersPipeline`**; сбор Drizzle — [`apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts`](../../apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts) (очередь `outgoing_delivery_queue` для `kind=reminder_dispatch`, счётчики **`reminder_occurrence_history`** / **`reminder_delivery_events`** за 24 ч UTC).
- **Статистика:** `GET /api/admin/reminder-stats` и **`GET /api/doctor/content-stats`** — общий загрузчик **`loadContentEngagementStats`** ([`loadAdminReminderStats.ts`](../../apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts)); UI [`ReminderStatsSection.tsx`](../../apps/webapp/src/app/app/settings/ReminderStatsSection.tsx) на **`/app/doctor/analytics/notifications`**. Контракт API — [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) (**admin/reminder-stats**, **doctor/content-stats**). Навигация — [`DOCTOR_CABINET_NAVIGATION.md`](../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md).
- **Тесты:** `apps/webapp/src/app/api/admin/reminder-stats/route.test.ts`, `apps/webapp/src/app/api/doctor/content-stats/route.test.ts`; расширен `system-health/route.test.ts` (мок `adminReminderPipelineMetrics`).

### 2026-05-17 — Архив dead-очередей + сброс из «Здоровье системы» (**закрыто**)

- **Таблица:** `public.operator_health_failure_archive` (миграция webapp **`0068`**), Drizzle `operatorHealthFailureArchive.ts`.
- **Семантика:** POST clear архивирует **все** `dead` для пробы `outgoing_delivery` (`outgoing_delivery_queue`) или `integrator_push_outbox` батчами по 500: `INSERT` архив → `DELETE` источника. Повтор при `dead=0`: **200**, `inserted=deleted=0`.
- **TTL:** записи старше **90** дней удаляются при **`POST /api/internal/system-health-guard/tick`** (best-effort `purgeExpired` после проверки outbox).
- **API:** `POST /api/admin/health-failure-archive/clear`, `GET /api/admin/health-failure-archive` (admin); `GET /api/doctor/health-failure-archive` — только **`doctor` \| `admin`**, строки с `health_probe=outgoing_delivery` и `doctor_user_id = session.user.userId` (рассылки врача; чужие не отдаём).
- **Аудит:** успешный `POST .../clear` пишет **`admin_audit_log`** с `action: health_failure_archive_clear_dead` и `details: { probe, inserted, deleted }`.
- **UI:** `SystemHealthSection` — подтверждение + clear при `deadTotal>0`; свёрнутый блок со ссылками на `?adminTab=health-archive&probe=`; вкладка **`health-archive`**; врач — `/app/doctor/broadcasts/archive` + ссылка с страницы рассылок.
- **Ограничения (осознанно):** due-бэклог очередей clear **не трогает**; счётчики `broadcast_audit.sent_count` / `error_count` при архивации **не** пересчитываются (как при `dead` в воркере — отдельная синхронизация вне этого объёма).

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

### 2026-06-06 — Блокировка бота TG/MAX (не деградация health)

- **Проблема:** blocked TG/MAX → `dead` + `error_count` → degraded «Очередь доставки» / «Доставка уведомлений» (prod-рассылка 2026-06-06).
- **Решение:** `failure_class=recipient_blocked_bot` исключён из operator `deadTotal`; attempts → `skipped`; отдельный `blocked_recipient_count` в `broadcast_audit`; маркер `user_channel_bindings.bot_blocked_at`.
- **Health UI:** `blockedRecipientTotal` (info) в `SystemHealthSection`; `pgHealthFailureArchive` — только operator-dead.
- **Миграция:** `0107_messenger_bot_blocked.sql`.
- **Post-deploy prod:** backfill SQL в [`DOCTOR_BROADCASTS.md`](../ARCHITECTURE/DOCTOR_BROADCASTS.md) § Post-deploy (ops gate, не блокер merge).
- Журнал: [`archive/2026-06-initiatives/MESSENGER_BOT_BLOCK_HANDLING_INITIATIVE/LOG.md`](../archive/2026-06-initiatives/MESSENGER_BOT_BLOCK_HANDLING_INITIATIVE/LOG.md); план [`.cursor/plans/archive/messenger_bot_block_handling.plan.md`](../../.cursor/plans/archive/messenger_bot_block_handling.plan.md).

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
