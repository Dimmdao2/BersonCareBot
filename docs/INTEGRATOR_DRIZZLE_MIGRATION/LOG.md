# Integrator Drizzle migration — execution log

## 2026-05-14

- Заведена инициатива: мастер-план и поэтапные планы в **`.cursor/plans/integrator_drizzle_migration_*.plan.md`** (корень `.cursor/plans/`). Закрытые планы репозитория — **`.cursor/plans/archive/`** ([README](../../.cursor/plans/archive/README.md)).
- Контекст: в интеграторе Drizzle для операторских таблиц через `@bersoncare/operator-db-schema` (`getIntegratorDrizzle`); целевые репозитории этапов P1–P4 переведены на Drizzle API и/или **`runIntegratorSql` / `execute(sql)`** (см. раздел «Закрытие инициативы»). Остатки **`db.query`** вне scope плана — в том же разделе.

## 2026-05-15

- Глобальный бэклог **«Integrator — один каталог записи (убрать дубль `integrator.rubitime_*`)»** — в [`docs/TODO.md`](../TODO.md) (раздел после Rubitime API2 фазы 2); пересекается с этапами Drizzle-репозиториев и cutover v1/v2.

### Этап 1 (P1 repos) — выполнено

- **Стратегия схемы (`schema-strategy`, мастер-план):** для этапа 1 принят **локальный дубль** — узкие `pgTable` в `apps/integrator/src/infra/db/schema/integratorPublicProduct.ts` сверены с `apps/webapp/db/schema/schema.ts` (колонки, уникальные ограничения; для `delivery_attempt_logs` — те же btree-индексы и CHECK `attempt > 0`, `status ∈ {success,failed}`). Зависимость от пакета webapp не добавлялась. Регистрация: `integratorDrizzleSchema.ts` + `getIntegratorDrizzle()` / `getIntegratorDrizzleSession()` в `apps/integrator/src/infra/db/drizzle.ts` (вместе с `@bersoncare/operator-db-schema`). **Backlog:** вынести общий набор таблиц в workspace-пакет по образцу `operator-db-schema`, когда дубль станет шире P1.
- **Переведены на Drizzle:** `repos/subscriptions.ts`, `topics.ts`, `booking_calendar_map` в `repos/bookingCalendarMap.ts`; синхронизация **`public.patient_bookings`** (поля `gcal_event_id` / `updated_at`) — **`runIntegratorSql`** + параметризованный **`sql`…``** (тот же канон, что P4), без `db.query`. `mailingLogs.ts`, `messageLogs.ts` (таблица **`delivery_attempt_logs`**; не путать с несуществующим именем `message_logs`).
- **Транзакции:** на `DbPort` внутри `createDbPort().tx` добавлено поле `integratorDrizzle` (тот же `pg` client); репозитории используют `getIntegratorDrizzleSession(port)` — без отката на пул внутри TX.
- **Валидация перед INSERT в `delivery_attempt_logs`:** в `messageLogs.ts` отсекаются строки с невалидными `channel` / `status` / `attempt` (до вызова Drizzle), чтобы не полагаться на небезопасные приведения типов.
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `pnpm --dir apps/integrator run test`.
- **Тесты:** заглушка `stubIntegratorDrizzleForTests.ts` для writePort/unit-тестов с мок-`DbPort`.
- **На момент записи мастер-плана этапа 1:** `mergeIntegratorUsers.ts` и прочий «тяжёлый» SQL **не входили** в scope; перенос — **мастер-план этап 4 (complex SQL)** (см. раздел **«Этап 4 (P4 — сложный SQL)»** ниже). Не путать с **Wave 2 этап 4** (webapp reminders).

### Этап 2 (outbox + job queue) — выполнено

- **Схема:** `apps/integrator/src/infra/db/schema/integratorQueues.ts` — `projection_outbox`, `rubitime_create_retry_jobs` (колонки и индексы как в `apps/webapp/db/schema/schema.ts`: partial `idx_projection_outbox_due`, unique `idx_projection_outbox_idempotency_key`, `idx_rubitime_create_retry_jobs_due`). Регистрация в `integratorDrizzleSchema.ts`.
- **`projectionOutbox.ts`:** `enqueueProjectionEvent` — Drizzle `insert` + `onConflictDoNothing`; `claimDueProjectionEvents` — **`getIntegratorDrizzleSession(db).execute(sql\`…\`)`** с прежним CTE + `FOR UPDATE SKIP LOCKED` + `RETURNING` с camelCase алиасами; `complete` / `fail` / `reschedule` — `update` + `eq`, для `next_try_at`/`updated_at` — фрагменты `sql` с тем же выражением интервала, что и в legacy.
- **`jobQueue.ts`:** `enqueueMessageRetryJob` — `insert` + `sql` для `next_try_at`; `claimDueMessageRetryJobs` — **`execute(sql\`…\`)`** (аналогичный claim-паттерн); `reschedule` / `complete` / `fail` — `update`.
- **Транзакции:** по-прежнему `getIntegratorDrizzleSession(port)` (в т.ч. внутри `createDbPort().tx`).
- **Тесты:** моки `getIntegratorDrizzleSession` в `projectionOutbox.test.ts`, `jobQueuePort.test.ts`; `projectionFanout.test.ts` и writePort-тесты — `stubIntegratorDrizzleForTests(capture)` на **корневом** `DbPort` (fanout после TX вызывает enqueue на root `db`); в stub добавлен **`onConflictDoUpdate`** для `mailing_logs` в том же tx.
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `pnpm --dir apps/integrator run test`.
- **Вне этапа 2:** без изменений в этом этапе оставались, в частности, `projectionHealth.ts` и `scripts/projection-health.mjs`. **`mergeIntegratorUsers.ts` в этапе 2 не переводился** (включая политику projection outbox); перенос на `runIntegratorSql` / `sql` выполнен позже в **P4** — см. раздел «Этап 4».

### Постаудит этапа 2 (2026-05-15)

- **`rubitime_create_retry_jobs`:** отмена pending/processing jobs по `bookingId` (напоминания при отмене записи) перенесена из сырого SQL в `recordM2mRoute.ts` в репозиторий — `cancelPendingBookingReminderJobsByBookingId` в `repos/jobQueue.ts` (Drizzle `update` + `and` / `inArray` / `eq` / `sql` по JSON path), единый канал с остальной очередью.
- **Тесты:** удалены мёртвые ветки перехвата `INSERT INTO projection_outbox` через `db.query` в writePort-тестах; `stubIntegratorDrizzleForTests` — capture только для `insert(projectionOutbox)`; assert на наличие `FOR UPDATE SKIP LOCKED` в аргументе `execute` для claim в `projectionOutbox.test.ts` и `jobQueuePort.test.ts`; добавлен `jobQueue.test.ts` на cancel; в `recordM2mRoute.test.ts` мок `jobQueue.js` расширен экспортом `cancelPendingBookingReminderJobsByBookingId`.
- **План:** `.cursor/plans/integrator_drizzle_phase_2_outbox_job_queue.plan.md` — todo `p2-audit-hardening`, секция «Постаудит», уточнение формулировки про эквивалентность claim-SQL.

### Этап 3 (доменные репозитории) — выполнено

- **Схема:** `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts` — `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `content_access_grants`, `rubitime_records`, `rubitime_events`, `appointment_records` (локальный `pgTable` без `pgSchema('public')` — совместимость Drizzle). Регистрация в `integratorDrizzleSchema.ts`.
- **Переведены на Drizzle:** `repos/reminders.ts` (чтения/апдейты через `getIntegratorDrizzleSession`; сложные выборки `getDueReminderOccurrences`, `getStaleReminderMessengerMessageIdForResend` — `execute(sql\`…\`)`с прежними JOIN/JSON),`repos/bookingRecords.ts`, `repos/publicAppointmentRecordSync.ts` (`insert(appointmentRecords).onConflictDoUpdate`).
- **Тесты:** расширен `stubIntegratorDrizzleForTests.ts` (`returning`, цепочки `select`/`join`/`where`/`orderBy`/`limit`); `readPort.test.ts` — тип `MockDbPort` для `query.mockResolvedValue`; `writePort.reminders.test.ts` — `vi.mock` на `getReminderOccurrenceContextForProjection` (стаб контекста проекций при unit-stub Drizzle); `reminders.staleMessenger.test.ts` — развёртка `sql` через `queryChunks` для assert по тексту SQL.
- **Проверки:** `pnpm --dir apps/integrator run lint`, `typecheck`, `test`.

### Постаудит этапа 3 (2026-05-15)

- **План:** `.cursor/plans/integrator_drizzle_phase_3_domain_repos.plan.md` — в frontmatter добавлено `status: completed`; YAML выровнен под стиль этапов 1–2 (`overview`/`content` через `>-`); DoD уточнён формулировкой «без сырого SQL через `db.query(...)`».
- **Код:** у `getDueReminderOccurrences` в `repos/reminders.ts` — JSDoc с пометкой escape hatch (`execute(sql)` + cross-schema JOIN), в духе DoD этапа 3.
- **Тесты:** `writePort.reminders.test.ts` по-прежнему мокает `getReminderOccurrenceContextForProjection` для стабильной fanout-проекции при stub Drizzle — осознанный trade-off unit-слоя (см. детальный аудит закрытия этапа).

### Этап 4 (P4 — сложный SQL) — выполнено

#### Инвентаризация P4 (конструкции → решение)

Зафиксировано для закрытия todo **p4-inventory** плана P4: везде **`runIntegratorSql` + `sql`…``** через `getIntegratorDrizzleSession` (пул или тот же клиент внутри `db.tx`), без строкового `DbPort.query` в целевых репозиториях.

| Файл                            | Нестандартные конструкции / нагрузка                                                                                                                 | Решение                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/messageThreads.ts`       | CTE (`WITH …`), несколько **`LEFT JOIN LATERAL`**, списки с `ORDER BY` / `LIMIT`                                                                     | Цельные фрагменты `sql`…``+`runIntegratorSql` на операцию                                                                                                 |
| `repos/channelUsers.ts`         | CTE для `upsertUser` / `telegram_state`, `ON CONFLICT`, lookup идентичности, `setUserPhone` (purge + upsert `contacts`)                              | То же; lookup в `setUserPhone` переведён с отдельного `db.query` на `runIntegratorSql`                                                                    |
| `repos/mergeIntegratorUsers.ts` | Длинная TX: пары identities, `telegram_state`, каскады по сателлитам, **`realignProjectionOutboxInTx`** (SELECT pending + построчные UPDATE / дедуп) | Последовательность `runIntegratorSql(tx, sql…)`; переписывание payload/idempotency — TypeScript (`projectionOutboxMergePolicy`) + параметризованные `sql` |

- **Инфра:** `runIntegratorSql` (`apps/integrator/src/infra/db/runIntegratorSql.ts`) — единая обёртка `getIntegratorDrizzleSession(db).execute(fragment)` с нормализацией `DbQueryResult` (в т.ч. `rowCount` только при `typeof === 'number'` для `exactOptionalPropertyTypes`). `drizzleSqlFragmentToApproximateSql` (`drizzleSqlDebugText.ts`) — развёртка `sql` для assert’ов в тестах.
- **Репозитории:** `messageThreads.ts`, `channelUsers.ts`, `mergeIntegratorUsers.ts` — доменные запросы через `runIntegratorSql` + `sql`…``(CTE/LATERAL/merge-транзакции); в`channelUsers.ts`в том числе`setUserPhone`(lookup identity + DELETE/INSERT contacts) без строкового`db.query`.
- **Тесты:** обновлены моки `integratorDrizzle.execute` (`messageThreads`, `channelUsers`, `mergeIntegratorUsers`, `readPort` fallback’и); `writePort.userUpsert.test.ts` — `attachExecuteToQuery` (flatten → legacy `query`-mock); `requestContactRoute.test.ts` — `dbWithTx` с `integratorDrizzle` и тем же мостом для `user.upsert`/`user.state.set`; `stubIntegratorDrizzleForTests` — `execute` как `vi.fn`.
- **Оставшийся сырой SQL вне P4-repos (осознанно):** `repos/outgoingDeliveryQueue.ts`; `repos/platformUserDeliveryPhone.ts` (`user.phoneForDeliveryLookup`); `repos/canonicalUserId.ts` и `repos/linkedPhoneSource.ts` — узкие `db.query` без переноса в scope этапа 4.
- **Проверки:** `pnpm --dir apps/integrator run lint`, `typecheck`, `test`.
- **Планы:** `.cursor/plans/integrator_drizzle_phase_4_complex_sql.plan.md` — `status: completed` в YAML frontmatter (как у этапа 3); мастер-план — `phase-4`, `dod-master` — `completed`.

### Постаудит этапа 4 (2026-05-15)

- **План:** в `.cursor/plans/integrator_drizzle_phase_4_complex_sql.plan.md` добавлено поле **`status: completed`** в frontmatter — синхрон с мастер-планом и записью в этом логе.
- **Тесты:** в `repos/messageThreads.test.ts` зафиксированы ожидаемые **`ORDER BY` / `LIMIT`** для открытого диалога по identity и для `listOpenConversations` (чек-лист P4 по поведению списков).

### Выравнивание после аудита (2026-05-15)

- **`bookingCalendarMap.ts`:** `public.patient_bookings` — только `runIntegratorSql` + `sql` (убраны остатки `db.query`); DoD этапа 1 согласован с кодом.
- **Планы:** в frontmatter **`.cursor/plans/integrator_drizzle_phase_1_simple_repos.plan.md`** и **`integrator_drizzle_phase_2_outbox_job_queue.plan.md`** добавлено **`status: completed`** (как у этапов 3–4 и мастера).

### Аудит тестов поведения БД по закрытым фазам (2026-05-15)

- Полный прогон **`pnpm --dir apps/integrator run test`**: зелёный; матрица покрытия P1–P4, ограничения моков и пробелы — в [`TEST_BEHAVIOR_AUDIT.md`](./TEST_BEHAVIOR_AUDIT.md).
- **Hardening по аудиту (тот же день):** добавлены unit-тесты без изменения прод-кода Drizzle — `repos/messageLogs.test.ts`, `repos/mailingLogs.test.ts`, `repos/bookingCalendarMap.test.ts`, `repos/reminders.projectionContext.test.ts` (`getReminderOccurrenceContextForProjection` без мока функции в отдельном файле); см. §3 в [`TEST_BEHAVIOR_AUDIT.md`](./TEST_BEHAVIOR_AUDIT.md).

### Инструментальные проверки (репозиторий)

- В корневом **`eslint.config.mjs`** **нет** отдельного правила, запрещающего **`db.query(...)`** по всему `apps/integrator` (только ограничения `no-restricted-imports` для `domain` / `telegram` / `worker`). Контроль канона SQL — **DoD этапных планов** и ревью; осознанный backlog — мелкие repos/config (Wave 2 P1+), `projectionHealthCore` (`db.query` в едином core), `migrate.ts`, скрипты.

### Закрытие инициативы (мастер-план P1–P4)

- Этапы **P1–P4** и **мастер-план** закрыты; целевые репозитории мастера не используют для доменной логики строковый **`db.query(...)`** (Drizzle API и/или **`runIntegratorSql` / `execute(sql)`**).
- После выравнивания: **`pnpm --dir apps/integrator run lint`**, **`typecheck`**, **`test`** — зелёные.
- **Wave 2 (2026-06-05):** этапы **1–8** закрыты — см. § ниже. **`outgoingDeliveryQueue`** и **`bookingProfilesRepo`** — Wave 2 P1. Backlog: мелкие integrator repos/config (P1+); media-worker **`processTranscodeJob`** → **фаза IX** (claim — **P8 done**, unit `claim.test.ts`).

### Wave 2 — план и инвентаризация (документация)

- Обновлены **`docs/INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md`** (волна после закрытого мастера P1–P4: фазы, риски, DoD по каналам `system_settings`, правило webapp `infra/repos`) и **`RAW_SQL_INVENTORY.md`** (в т.ч. **`public.integrator_push_outbox`**, оценки для `client.ts` / `migrate.ts` / `branchTimezone`, уточнение `rg` для `db.query`).
- Поэтапные планы выполнения Wave 2: **`docs/INTEGRATOR_DRIZZLE_MIGRATION/plans/`** ([`plans/README.md`](plans/README.md) — индекс `wave2_phase_01` … `wave2_phase_08`).
- Постаудит **рассылок врача / `outgoing_delivery_queue`**: webapp `pgDoctorBroadcastDelivery` — `INSERT … ON CONFLICT (event_id) DO NOTHING` + откат транзакции при `rowCount ≠ 1` (**один** `ROLLBACK` в `catch`, без дубля перед `throw`); integrator `outgoingDeliveryWorker` — при планируемом ретрае только **`logger.debug`** с усечённым `error` (без сырого `err` в структурированных полях); **`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`** и строка **`outgoingDeliveryWorker`** в **`RAW_SQL_INVENTORY.md`** приведены в соответствие с кодом.
- **Рассылки врача — меню в чате:** `doctorBroadcastIntentMenu.ts` (обогащение `message.send` до **`dispatchOutgoing`**, паритет с `delivery.ts` / `buildMainReplyKeyboardMarkup` и MAX inline через `enrichMessageSendPayloadWithMaxMainInlineIfApplicable`); **`runIntegratorSql`** для резолва телефона по `public.platform_users` / `contacts`; unit-тесты `doctorBroadcastIntentMenu.test.ts`, расширение `outgoingDeliveryWorker.test.ts`; колонка **`broadcast_audit.attach_menu_after_send`**, флаг **`payload_json.attachMenu`**; миграция webapp **`0066_broadcast_audit_attach_menu_after_send.sql`**.
- **Мастер-план** `.cursor/plans/archive/integrator_drizzle_migration_master.plan.md`: frontmatter выровнен под этапы 1–2 (`status` сразу после `name`, `overview: >-`), todo **`wave-2-doc-sync`** (completed); в теле плана — раздел **«Следующая волна (Wave 2)»** со ссылками на `DRIZZLE_TRANSITION_PLAN` / `RAW_SQL_INVENTORY` / `LOG`.

### Перенос планов в архив (2026-06-04)

- Повторная верификация: все **5** планов (`integrator_drizzle_migration_master` + `phase_1` … `phase_4`) — **`status: completed`**, todos и DoD-чеклисты закрыты; **`pnpm --dir apps/integrator run typecheck`** и **`test`** — зелёные (1005 passed).
- **`git mv`** из `.cursor/plans/` в **`.cursor/plans/archive/`**; относительные ссылки на `apps/` / `docs/` в теле планов поправлены (`../../../`).
- Индекс: [`docs/README.md`](../README.md), [`docs/TODO.md`](../TODO.md), [`.cursor/plans/archive/README.md`](../../.cursor/plans/archive/README.md).

## 2026-06-05

### Wave 2 — этап 1 (integrator tail SQL) — выполнено (ядро; 2026-06-05)

- **Scope-факт (переведено):** `outgoingDeliveryQueue.ts`, `notificationDeliveryAttempts.ts`, `messengerPhoneBindAudit.ts`, `settingsSyncRoute.ts`, `bookingProfilesRepo.ts`, `outgoingDeliveryWorker.ts` (точечный SQL). Оставшиеся `client.query` после этапов 1–3 — advisory **фаза 3** (`schedulerLocks`, `rubitimeApiThrottle` throttle row) и тестовый nock.
- **Backlog Wave 2 P1+ (не входило в закрытие):** `platformUserDeliveryPhone`, `canonicalUserId`, `linkedPhoneSource`, `resolvePlatformUserIdForRubitimeBooking`, `patientHomeMorningPing`, `idempotencyKeys`, `adminStats`, `integrationDataQualityIncidents`, `branchTimezone`, `adminIncidentAlertRelay`, `smtpOutbound`, `messengerStaffIds`, `operationalVerboseLog` — по-прежнему `db.query`; см. [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) §1.2.
- **Очередь доставки:** `outgoingDeliveryQueue.ts` переведён с `DbPort.query` на `runIntegratorSql` + `drizzle-orm sql`; claim сохранён как CTE с `FOR UPDATE SKIP LOCKED`, без изменения статусов/сортировки/retry policy.
- **Worker доставки:** `outgoingDeliveryWorker.ts` перевёл точечные SQL-чтения/апдейты (`user_reminder_occurrences`, `broadcast_audit.sent_count/error_count`) на `runIntegratorSql`; `dispatchOutgoing`, retry/dead-finalize и `attachMenu` семантика не менялись.
- **Rubitime legacy profiles:** `bookingProfilesRepo.ts` переведён на `runIntegratorSql` + `sql` поверх текущих `integrator.rubitime_*`; дедуп/перевод на `public.booking_*` не начинался.
- **Settings mirror:** `settingsSyncRoute.ts` upsert `integrator.system_settings` переведён на `runIntegratorSql` + `sql`; HTTP sync, зеркало и cache invalidation (`app_base_url`, timezone, Google, SMTP, verbose log, staff ids) сохранены.
- **Audit/attempt repos:** `messengerPhoneBindAudit.ts` и `notificationDeliveryAttempts.ts` переведены на `runIntegratorSql`; unique violation helper учитывает `cause.code` от Drizzle/pg wrapper.
- **Тесты:** обновлены unit-тесты `settingsSyncRoute.test.ts`, `notificationDeliveryAttempts.test.ts`, `outgoingDeliveryWorker.test.ts` на seam `runIntegratorSql`; добавлены `outgoingDeliveryQueue.test.ts` (idempotent enqueue, stale reset, claim `FOR UPDATE SKIP LOCKED`, sent/dead/retry statuses) и `bookingProfilesRepo.test.ts` (legacy `rubitime_*`, active-only lookup, coalesced unique constraint, отсутствие `public.booking_*`). Проверки зелёные: `pnpm --dir apps/integrator run typecheck`; `pnpm --dir apps/integrator run test` — **1016 passed, 6 skipped**. Локально есть предупреждение окружения: Node `v20.18.2` при требовании проекта `>=22`.
- **План:** `docs/INTEGRATOR_DRIZZLE_MIGRATION/plans/wave2_phase_01_integrator_tail.plan.md` — `status: completed`, todos и DoD закрыты.

### Wave 2 — этап 2 (projection health + CLI) — выполнено

- **Baseline полей:** единый snapshot `projection_outbox` сохраняет поля `pendingCount`, `deadCount`, `cancelledCount`, `oldestPendingAt`, `processingCount`, `retryDistribution`, `lastSuccessAt`, `retriesOverThreshold`. Эти же поля отдаёт `GET /health/projection` и печатает CLI.
- **Единый runtime core:** расчёт вынесен в `apps/integrator/src/infra/db/repos/projectionHealthCore.ts`; `projectionHealth.ts` стал thin wrapper над core, а `isProjectionHealthDegraded` используется общим release-gate/CLI контрактом.
- **CLI:** исполняемый код перенесён в `apps/integrator/src/infra/scripts/projection-health.ts`; npm dev-команда — `pnpm --dir apps/integrator run projection-health` (`tsx src/infra/scripts/projection-health.ts`), host-команда после build — `pnpm --dir apps/integrator run projection-health:host` или напрямую `node apps/integrator/dist/infra/scripts/projection-health.js`. Старый `apps/integrator/scripts/projection-health.mjs` оставлен compatibility wrapper к compiled модулю и не содержит SQL.
- **Env/DB режимы:** CLI сохраняет порядок URL `INTEGRATOR_DATABASE_URL` → `SOURCE_DATABASE_URL` → `DATABASE_URL` и прежнюю загрузку cutover-env (`CUTOVER_ENV_FILE`, `/opt/env/bersoncarebot/cutover.prod`, `.env.cutover.dev`, `.env.cutover`). Для unified DB обычно достаточно `DATABASE_URL` из integrator/webapp env; для legacy/cutover остаётся `INTEGRATOR_DATABASE_URL`.
- **Drizzle builder отложен:** агрегаты `projection_outbox` остались параметризованным raw SQL внутри одного core. Это сознательно соответствует DoD этапа 2: убрать расхождение CLI/HTTP без изменения release-gate semantics.
- **Проверки:** `rg` подтвердил, что `scripts/projection-health.mjs` больше не содержит `projection_outbox` SQL; добавлен in-process route smoke `routes.projectionHealth.test.ts` для `GET /health/projection` (200 snapshot + 503 fallback) и CLI тесты на stdout/exit-code; `pnpm --dir apps/integrator run lint`, `typecheck`, `test` — зелёные (`test`: **1021 passed, 6 skipped**); `pnpm --dir apps/integrator run build` — зелёный и подтвердил compiled CLI в `dist`. Локально сохраняется предупреждение окружения: Node `v20.18.2` при требовании проекта `>=22`.
- **План:** `docs/INTEGRATOR_DRIZZLE_MIGRATION/plans/wave2_phase_02_projection_health_sync.plan.md` — `status: completed`, todos и DoD закрыты.

### Wave 2 — этап 3 (advisory locks) — выполнено

- **Общий канон:** advisory lock/unlock через `drizzle-orm` `execute(sql\`…\`)` на **том же** `PoolClient`, что и окружающий SQL (`db.connect()` / `pool.connect()`). На dedicated client это `drizzle(client).execute(sql)` — эквивалент `getIntegratorDrizzleSession(port).execute(sql)` внутри TX, но без `DbPort`. Хелперы: `apps/integrator/src/infra/db/pgAdvisoryLock.ts`, `apps/webapp/src/infra/db/pgAdvisoryLock.ts`.
- **Integrator:** `rubitimeApiThrottle.ts` — session `pg_advisory_lock` / `unlock` (int key `58220114`, тот же `connect()` + `finally`); `schedulerLocks.ts` — `pg_try_advisory_lock` / `pg_advisory_unlock` на dedicated client.
- **Webapp:** `userLifecycleLock.ts`, `multipartSessionLock.ts`, `pgOnlineIntake.ts` (только shared xact lock), `strictPlatformUserPurge.ts`, `s3MediaStorage.ts` (только session lock/unlock в `deleteHard`); `pgDiaryPurge.ts` — purge обёрнут в `withUserLifecycleLock(..., "exclusive")` (раньше транзакция без advisory; ключ `hashtext(platform_user_id::text)` как у strict purge).
- **Вне этапа 3 (осознанно):** `modules/auth/*RateLimit.ts`, `publicBookingRateLimit.ts` — этап 7 Wave 2; остальной SQL в `s3MediaStorage.ts` и медиа-repos — **выполнен Wave 2 P5** (2026-06-05).

#### Семантика блокировок (session vs transaction)

| Файл | Тип | Ключ | Release |
|------|-----|------|---------|
| `rubitimeApiThrottle.ts` | session `pg_advisory_lock` | int `58220114` | `pg_advisory_unlock` в inner `finally` до `client.release()` |
| `schedulerLocks.ts` | session `pg_try_advisory_lock` | int (scheduler slot) | `release()` handle → unlock + `client.release()` |
| `userLifecycleLock.ts` | xact exclusive/shared | `hashtext(userId::text)` | автоматически при `COMMIT`/`ROLLBACK` |
| `multipartSessionLock.ts` | xact exclusive | `hashtext('multipart_session:' \|\| id)` | при завершении tx |
| `pgOnlineIntake.ts` | xact shared | `hashtext(userId::text)` | при завершении tx |
| `pgDiaryPurge.ts` | xact exclusive (via lifecycle lock) | `hashtext(userId::text)` | при завершении tx |
| `strictPlatformUserPurge.ts` | xact exclusive | `hashtext(userId::text)` | при завершении tx |
| `s3MediaStorage.deleteHard` | session | `hashtext(mediaId)` | `unlock` в `finally` на **том же** `PoolClient`, что lock и DML |

**Чеклист ревью для новых locks:** не менять ключ/hash без ADR; session-lock только на одном `PoolClient` (не смешивать `pool.query` между lock и unlock); xact-lock только внутри уже открытой транзакции; `pg_try_*` не заменять на blocking без причины; не дублировать int-ключи Rubitime/scheduler.

- **Постаудит / дожим (2026-06-05):** `s3MediaStorage.deleteHard` — lock+DML на одном `PoolClient` (убран `drizzle(pool)` для session-lock). Тесты: integrator `pgAdvisoryLock.test.ts`, `schedulerLocks.test.ts`, `rubitimeApiThrottle.test.ts` (ключ `RUBITIME_API_ADVISORY_LOCK_KEY` = 58220114); webapp `pgAdvisoryLock.test.ts`, `userLifecycleLock.test.ts`, `multipartSessionLock.test.ts`, `pgDiaryPurge.test.ts`, `pgOnlineIntake.advisoryLock.test.ts`, `strictPlatformUserPurge.test.ts`. `RAW_SQL_INVENTORY.md` — строки P3 помечены **Wave 2 P3 done**.
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `test` — **1028 passed**, 6 skipped; webapp `tsc --noEmit`; vitest fast по файлам этапа 3 — **23 passed**; `rg` по `apps/*/src/infra` — нет `client.query`/`pool.query` с `pg_advisory` в scope P3.
- **Остаток:** нет (P7 post-audit closure: `publicBookingRateLimit` переведён на общий `authRateLimits` + `pgAuthRateLimitEvents`).
- **План:** `docs/INTEGRATOR_DRIZZLE_MIGRATION/plans/wave2_phase_03_advisory_locks.plan.md` — `status: completed`, секция «Закрытие».

### Wave 2 — этап 4 (webapp напоминания) — выполнено (2026-06-05)

- **Инфра:** `apps/webapp/src/infra/db/runWebappSql.ts` — `runWebappSql`, `runWebappTransaction`, тип `WebappSqlTransactionExecutor` с `tx.rollback()` (ранние выходы journal/rules/delete без throw).
- **Репозитории:** `pgReminderRules.ts`, `pgReminderJournal.ts`, `pgWebPushOnlyReminders.ts` (включая `cancelWebPushOnlyPendingOccurrencesForRule`, claim `FOR UPDATE SKIP LOCKED`); `pgReminderProjection.ts` — upsert/read/mark seen через `execute(sql)`; `pgReminderTransactionalEmailCooldown.ts` — Drizzle ORM на `email_send_cooldowns`.
- **Ограничение:** в `pgReminderProjection` остаётся `getPool()` только для вызовов `findCanonicalUserIdByIntegratorId` / `loadWarmupsSectionSlugs` (внешние хелперы, без `pool.query` в SQL projection).
- **Тесты (vitest `--project fast`, 8 файлов):** **36 passed** — PG: `pgReminderProjection.pg.test.ts`, `pgReminderRules.test.ts`, `pgReminderJournal.pg.test.ts`, `pgWebPushOnlyReminders.pg.test.ts`, `pgReminderTransactionalEmailCooldown.test.ts`; in-memory/contract: `pgReminderProjection.test.ts`, `pgWebPushOnlyReminders.test.ts`, `inMemoryReminderJournal.test.ts`.
- **Проверки:** `pnpm exec tsc --noEmit` (webapp); `rg 'pool\.query|client\.query'` по `apps/webapp/src/infra/repos/pgReminder*.ts` и `pgWebPushOnlyReminders.ts` — **0**; `RAW_SQL_INVENTORY.md` — P4 done для projection/rules/journal/webpush/cooldown.
- **План:** [wave2_phase_04_webapp_reminders.plan.md](./plans/wave2_phase_04_webapp_reminders.plan.md) — `status: completed`, todos и DoD закрыты.

### Wave 2 — этап 5 (webapp медиа) — выполнено (2026-06-05)

- **Инфра:** `mediaSqlPredicates.ts` — общие SQL-предикаты readable/purge; `runWebappSql.getWebappSqlFromPgClient` — Drizzle на dedicated `PoolClient` (multipart tx, preview/purge workers, session advisory в `deleteHard`).
- **Репозитории:** `mediaFoldersRepo.ts`, `mediaUploadSessionsRepo.ts`, `pgMediaTranscodeJobs.ts`, `pgMediaFileIntakeResolve.ts`, `pgMediaUsageSummary.ts`, `s3MediaStorage.ts`, `mediaPreviewWorker.ts` — Drizzle builder / `runWebappSql`; claim/purge/preview — `execute(sql)` с `FOR UPDATE SKIP LOCKED` где было в legacy.
- **Routes:** `media/multipart/init` — rollback pending через `deletePendingMediaFileById`; `internal/media-multipart/cleanup` — SQL в repo (`lockExpiredSessionForCleanupTx`, `deletePendingMediaFileTx`).
- **Остаток (осознанно):** `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` на dedicated client в workers/multipart pool-tx; `collectAdminSystemHealthData` media metrics — без изменений (отдельный этап при унификации health SQL); transcode **claim** — **P8 done** (`apps/media-worker/src/jobs/claim.test.ts`); **`processTranscodeJob`** status SQL — backlog **фаза IX**.
- **Smoke-чеклист:**
  - [x] multipart init → rollback при DB failure (unit `init/route.test.ts`: pending + session insert).
  - [x] internal multipart cleanup → pending purge / mark expired / skip stale lock (unit `cleanup/route.test.ts`).
  - [x] preview worker claim → ready/error (unit `mediaPreviewWorker.test.ts`).
  - [x] pending_delete purge / hard delete advisory order (unit `s3MediaStorage.test.ts`).
  - [x] transcode enqueue idempotent (unit `pgMediaTranscodeJobs.test.ts`, incl. program submission).
  - [x] media-worker claim unit tests (Wave 2 P8 — `claim.test.ts`, 4 tests).
  - [ ] staging-only: end-to-end multipart upload + transcode claim на media-worker (**gate фаза 17**; чеклист — [LOG](./LOG.md) §Wave 3 phase 10 / 10C).
- **Постаудит (2026-06-05):** cleanup `cleaned` не завышается при stale lock; RAW_SQL уточнён (enqueue vs claim); расширены unit-тесты.
- **Тесты (vitest `--project fast`, P5 bundle):** **56 passed** — `init`, `cleanup`, `mediaFoldersRepo`, `mediaUploadSessionsRepo`, `pgMediaTranscodeJobs`, `s3MediaStorage`, `mediaPreviewWorker`, `pgMediaFileIntakeResolve`, `mediaTranscodeAutoEnqueue`.
- **Проверки:** `pnpm --dir apps/webapp run typecheck`; **`pnpm run ci` — green (2026-06-05)**; `rg 'pool\.query|client\.query'` по media scope — только TX transport на `PoolClient`.
- **Синхронизация документов (2026-06-05):** [plans/README.md](./plans/README.md) (индекс P5 → completed), [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md) (фаза V → Done), [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) (§2.4–2.6 P5).
- **План:** [wave2_phase_05_webapp_media.plan.md](./plans/wave2_phase_05_webapp_media.plan.md) — `status: completed`, todos, DoD и §«Закрытие».

### Wave 2 — этап 6 (webapp ЛФК) — выполнено (2026-06-05)

- **Инфра:** `runWebappSql.ts` — `webappSqlFromPgText` / `runWebappPgText` (legacy `$1..$n` → Drizzle `execute(sql)`).
- **Репозитории:** `pgLfkExercises.ts`, `pgLfkTemplates.ts`, `pgLfkDiary.ts`, `pgLfkAssignments.ts` — DML/read через `runWebappPgText` / `runWebappTransaction`; list/usage SQL без смены shape.
- **Транзакции (post-audit):** create/update упражнений и `updateExercises` — **`runWebappTransaction`**; **`pool.query` / `client.query` — 0** в `pgLfk*.ts`.
- **Smoke-чеклист:**
  - [x] doctor catalog list/archive/create/update (unit `pgLfkExercises.test.ts`).
  - [x] template list/usage/reorder tx (unit `pgLfkTemplates.test.ts`).
  - [x] assignment first assign + re-assign + empty template error (unit `pgLfkAssignments.test.ts`).
  - [x] patient diary session/complex scoping + add/update session (unit `pgLfkDiary.test.ts`).
- **Тесты (vitest, P6 bundle):** **27 passed** — `pgLfkAssignments`, `pgLfkExercises`, `pgLfkTemplates`, `pgLfkDiary`, `e2e/lfk-assign-inprocess`.
- **Проверки:** `pnpm --dir apps/webapp run typecheck`; **`pnpm run ci` — green (post-audit 2026-06-05)**.
- **Синхронизация документов:** [plans/README.md](./plans/README.md) (P6 → completed), [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md) (фаза VI → Done), [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) (`pgLfk*`).
- **План:** [wave2_phase_06_webapp_lfk.plan.md](./plans/wave2_phase_06_webapp_lfk.plan.md) — `status: completed`, todos, DoD, §«Закрытие».
- **Финальная синхронизация (post-audit):** `pgLfkDiary.test.ts` — add/update session; assignments — abort без лишних SQL; frontmatter/todos плана; `docs/README.md` (Wave 2 этапы 1–6); P6 bundle **27** tests.

### Wave 2 — этап 7 (webapp auth + rate limits) — выполнено (2026-06-05)

- **Infra:** `pgAuthRateLimitEvents.ts` — sliding window + `pg_advisory_xact_lock` через `runWebappTransaction`; `pgPhoneOtpLimits.ts`; `pgDevBypassPlatformUserPhone.ts`; `pgEmailAuth.ts`; `pgChannelLinkClaim.ts`; `pgOAuthUserResolve.ts`.
- **Rate limits (6):** auth (5) + `publicBookingRateLimit` — DB-path через `checkAndRecordAuthRateLimitEvent`; wiring в `modules/auth/authRateLimits.ts` + `createSlidingWindowRateLimit`; in-memory fallback и ключи/window без изменений.
- **Clean Architecture (post-audit):** `authRateLimitPort`, `emailAuthPort`, `phoneOtpLimitsPort`, `devBypassPlatformUserPhonePort`, `oauthUserResolvePort`, `emailSendPort` в module layer; `bindAuthModulePorts.ts` + `ensureAuthModulePortsBound()` в `buildAppDeps` и API routes до rate limit / email / OAuth resolve; ESLint allowlist сужен (rate limits, emailAuth, phoneOtpLimits, publicBookingRateLimit, oauth resolve сняты).
- **OTP / email:** `phoneOtpLimits` → `pgPhoneOtpLimits`; `emailAuth` → `pgEmailAuth` через port; отправка кода → `emailSendPort`.
- **Channel link:** claim SQL → `pgChannelLinkClaim`; `channelLink.ts` — DML через Drizzle bridge; `client.query(BEGIN|COMMIT|ROLLBACK)` только для `mergePlatformUsersInTransaction` и claim tx.
- **OAuth resolve:** SQL → `pgOAuthUserResolve`; модули `oauthYandexResolve` / `oauthWebLoginResolve` — business logic через port (без `@/infra/*` в modules).
- **service.ts:** dev bypass phone UPDATE → port `applyDevBypassPlatformUserPhoneInDb` (allowlisted: dynamic import infra для `pgUserByPhone`).
- **Остаток (осознанно):** `client.query` tx control в channel link merge/claim; allowlisted legacy: `channelLink.ts`, `service.ts`, `oauthWebSession.ts`, `yandexOAuthCallbackHandler.ts`.
- **Тесты (vitest `--project fast`):** auth module **243 passed**; additions — `pgAuthRateLimitEvents.test.ts`, `pgOAuthUserResolve.test.ts`, `oauthWebLoginResolve.test.ts`, opt-in `pgAuthRateLimitEvents.devDb.integration.test.ts`.
- **Проверки:** `pnpm --dir apps/webapp run typecheck`; полный `pnpm run ci`.
- **План:** [wave2_phase_07_webapp_auth_rate_limits.plan.md](./plans/wave2_phase_07_webapp_auth_rate_limits.plan.md) — `status: completed`, todos, DoD, §«Закрытие».

### Wave 2 — этап 8 (packages, media-worker, scripts) — выполнено (2026-06-05)

#### A. `packages/platform-merge` — pg-only (решение)

- **Inventory:** `rg "query\\(" packages/platform-merge --glob "*.ts"` — ~85 в `pgPlatformUserMerge.ts`, + `messengerPhonePublicBind.ts`, `mergeContactFallback.ts`.
- **Решение:** merge/bind **не переводить** на Drizzle в Wave 2 — полиморфная TX, десятки таблиц, критичные пользовательские данные; public API semver без изменений.
- **Consumers:** webapp `integrator-merge` route, integrator merge paths — без правок контракта.

#### B. `packages/booking-rubitime-sync` — унификация

- **Пакет:** `findExistingPatientBookingForRubitime`, `upsertPatientBookingFromRubitime`, `lookupBranchServiceByRubitimeIds`, `shouldSkipNativeReviveUpdate`, `computeCompatSyncQuality` — единый канон SQL через `SqlExecutor`.
- **Webapp:** `pgPatientBookings.upsertFromRubitime` — find/revive guard → делегирование; удалён дубль `apps/webapp/src/infra/repos/rubitimeBranchServiceLookup.ts`.
- **Integrator:** `writePort` booking.upsert — тот же find/revive guard + upsert с `existingRow`.
- **Backfill:** `backfill-rubitime-compat-snapshots.ts` phase 2 — lookup через пакет (без дубля SQL).
- **Re-export:** `modules/patient-booking/compatSyncQuality.ts` → `@bersoncare/booking-rubitime-sync`.
- **Drizzle в пакете:** отложен (нет shared schema package; поведение SQL 1:1 с legacy).
- **Тесты:** package **27 passed**; webapp `pgPatientBookings.test.ts` **19 passed**; integrator `writePort.appointments` **9 passed**.

#### C. `apps/media-worker`

- **Schema decision:** worker остаётся на `pg.Pool`; **не** дублировать webapp Drizzle schema локально; shared schema package — отдельный backlog до runtime Drizzle в worker.
- **Claim:** `src/jobs/claim.ts` — pg `FOR UPDATE SKIP LOCKED`; unit `claim.test.ts` (**4 tests**: empty, claim one, reclaim stale, concurrent miss → ROLLBACK).
- **Backlog:** `processTranscodeJob.ts` — pg-only status updates (фаза IX follow-up).
- **Тесты:** media-worker **17 passed**; typecheck green.

#### D. Scripts — классификация (pg-only, одна строка на файл)

| Script | Класс | Причина |
|--------|-------|---------|
| `run-migrations.mjs` | migration | SQL migration runner |
| `run-webapp-drizzle-migrate.mjs` | migration | drizzle-kit migrate wrapper |
| `seed-drizzle-migrations-meta.mjs` | ops | bootstrap `drizzle.__drizzle_migrations` |
| `verify-drizzle-public-table-count.mjs` | report | row-count audit |
| `fix-drizzle-introspect-defaults.mjs` | ops | one-off DDL meta fix |
| `check-drizzle-journal-sync.sh` | ops | shell guard |
| `check-legacy-migrations-frozen.sh` | ops | shell guard |
| `check-catalog-shared-primitives.sh` | ops | shell guard |
| `check-media-preview-invariants.sh` | ops | shell guard |
| `reconcile-person-domain.mjs` | reconcile | batch ops SQL |
| `reconcile-appointments-domain.mjs` | reconcile | batch ops SQL |
| `reconcile-reminders-domain.mjs` | reconcile | batch ops SQL |
| `reconcile-communication-domain.mjs` | reconcile | batch ops SQL |
| `reconcile-subscription-mailing-domain.mjs` | reconcile | batch ops SQL |
| `backfill-person-domain.mjs` | backfill | batch ops SQL |
| `backfill-appointments-domain.mjs` | backfill | batch ops SQL |
| `backfill-reminders-domain.mjs` | backfill | batch ops SQL |
| `backfill-subscription-mailing-domain.mjs` | backfill | batch ops SQL |
| `backfill-communication-history.mjs` | backfill | batch ops SQL |
| `backfill-rubitime-history-to-patient-bookings.ts` | backfill | batch history → `patient_bookings` |
| `backfill-rubitime-compat-snapshots.ts` | backfill | payload + `@bersoncare/booking-rubitime-sync` lookup |
| `backfill-patient-bookings-v2.ts` | backfill | legacy v2 rows |
| `video-hls-backfill-legacy.ts` | backfill | legacy HLS |
| `requeue-projection-outbox-dead.ts` | ops | outbox admin |
| `realign-webapp-integrator-user-projection.ts` | ops | projection realign |
| `seed-content-pages.mjs` | seed | content seed tx |
| `seed-booking-catalog-tochka-zdorovya.ts` | seed | catalog seed |
| `user-phone-admin.ts` | ops CLI | admin merge/purge |
| `integrator-push-outbox-tick.ts` | runtime tick | tick к app endpoint |
| `media-preview-process-tick.ts` | runtime tick | preview worker tick |
| `audit-platform-user-merge.sql` | report/ops | manual psql audit |
| `audit-platform-user-preflight.sql` | report/ops | manual psql preflight |
| `repair-client-8077942.sql` | ops | one-off repair |
| `rubitime-appointment-mapping-audit.sql` | report | dry-run metrics |
| `backfill-rubitime-appointment-mappings.sql` | ops | mapping backfill |
| `stage13-gate.test.ts` | test | gate script tests |
| `stage13-preflight.test.ts` | test | preflight script tests |
| `backfill-person-domain.test.ts` | test | backfill script tests |
| `apps/integrator/scripts/projection-health.mjs` | CLI wrapper | thin wrapper → `projectionHealthCore` (P2) |

#### Post-audit P8 (2026-06-05)

- **Package tests:** `lookupBranchServiceByRubitimeIds.test.ts`, `shouldSkipNativeReviveUpdate.test.ts`; upsert — update, idempotent, ambiguous (**27 passed**).
- **Integrator:** `writePort.appointments.test.ts` — INSERT/UPDATE contract + revive skip (**9 passed**).
- **media-worker:** `claim.test.ts` — race UPDATE empty → ROLLBACK (**4 claim tests**, suite **17 passed**).
- **platform-merge consumers:** webapp merge tests **44 passed**.
- **Archive docs:** superseded notes для удалённого `rubitimeBranchServiceLookup.ts`.
- **Проверки:** `pnpm --dir packages/booking-rubitime-sync run build && test`; targeted webapp/integrator/media-worker tests; **`pnpm run ci` — green (2026-06-05, post-audit + remarks closure)**.
- **План:** [wave2_phase_08_packages_worker_scripts.plan.md](./plans/wave2_phase_08_packages_worker_scripts.plan.md) — `status: completed`, todos **6/6**, DoD, §«Закрытие» / §«Post-audit / remarks closure».
- **Синхронизация:** [plans/README.md](./plans/README.md), [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) §2.7 / §3–4, [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md) фазы VIII–IX, [docs/README.md](../README.md).
- **Backlog Wave 2 после P8:** фаза **IX** — `media-worker/processTranscodeJob`; фаза **X** — прочие `pg*` repos; Drizzle в `booking-rubitime-sync` / `platform-merge` — отдельные планы.

### Документация — финальная синхронизация P8 (2026-06-05)

- План [wave2_phase_08](./plans/wave2_phase_08_packages_worker_scripts.plan.md): §«Закрытие» / §«Post-audit» согласованы с LOG и счётчиками тестов.
- [wave2_phase_05](./plans/wave2_phase_05_webapp_media.plan.md): claim → P8 done; `processTranscodeJob` → IX.
- [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md): фазы V, VIII–X; [plans/README.md](./plans/README.md); [docs/README.md](../README.md); мастер-план §Wave 2.

### Wave 3 — фаза 00 (baseline + ADR) — выполнено (2026-06-05)

Документация-only; код не менялся. План: [wave3_phase_00_baseline_adr.plan.md](./plans/wave3_phase_00_baseline_adr.plan.md).

#### Wave 3 baseline (`rg`, 2026-06-05)

| Зона | Метрика | Сверка с ожиданием |
|------|---------|-------------------|
| Integrator `await db.query` (без `migrate.ts` / scripts) | **20** prod-файлов | ✓ (19 P1+ domain + `client.ts` Class C) |
| Integrator `rubitimeApiThrottle` throttle row | **2** `client.query` | ✓ (фаза 09E, Class B) |
| Webapp `pool.query` \| `client.query` (без тестов) | **78** prod-файлов | ✓ |
| Webapp `integratorPushOutbox.ts` | `db.query` на Pool (вне grep `pool.query`) | ✓ → фаза 15D |
| media-worker `claim.ts` | **8** `pool.query` | ✓ Class C |
| media-worker `processTranscodeJob` + `processProgramSubmissionTranscode` | **17** (10 + 7) at baseline → **0** direct `pool.query` after phase **10** | ✓ target фаза 10 (**done** 2026-06-06) |
| media-worker settings | **2** (1 + 1) at baseline → **0** direct `pool.query` after phase **10** | ✓ target фаза 10 (**done** 2026-06-06) |
| `packages/platform-merge` | **85** `.query(` (79 + 2 + 4) | ~92 ожидание → факт **85** (уточнено в RAW_SQL) |
| `packages/booking-rubitime-sync` | **4** `.query(` | ✓ Class C |

Полная таблица Class A/B/C: [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) § «Wave 3 baseline».

#### ADR — permanent zones (не переоткрывать в фазах 09–15)

| Артефакт | Решение |
|----------|---------|
| **platform-merge** | Merge engine; Drizzle builder rewrite = **out of scope** (Class C). |
| **booking-rubitime-sync** | `SqlExecutor` + pg text; canonical Rubitime fields **unchanged** (Class C). |
| **claim** (integrator outbox/job/queue + media-worker `jobs/claim.ts`) | `FOR UPDATE SKIP LOCKED` на dedicated pg session (Class C). |
| **projectionHealthCore** | Параметризованные агрегаты; CLI/HTTP parity **>** builder `groupBy` (Class B). |
| **migrate.ts / one-off scripts** | pg ledger / batch ops transport (Class C). |
| **DbPort / health `client.ts`** | TX transport + `SELECT 1` (Class C). |

#### Зафиксированные решения (вопросы 1–10, [wave3_DECISIONS.md](./plans/wave3_DECISIONS.md))

1. **Webapp scope:** полный closeout runtime `apps/webapp/src` (без `*.test.ts`) в фазах **11–15**; после 15 — только Class B/C в RAW_SQL.
2. **`messengerPhoneHttpBindExecute.ts`:** миграция в **фазе 15** (Drizzle executor + Zod), **не** permanent C.
3. **media-worker shared schema:** **не** делаем в Wave 3; minimal `execute(sql)` на существующем `pg.Pool` (фаза 10).
4. **Staging smoke:** обязателен перед closeout (**фаза 17**); без owner/стенда — Wave 3 `blocked`, не `completed`.
5. **PR policy:** **1 PR = 1 фаза**; исключение `00+09` при ускорении старта; merge — `pnpm run ci`.
6. **`rubitimeApiThrottle` throttle row:** фаза **09E** → Drizzle session на том же `PoolClient` (Class B).
7. **Google Calendar SQL:** все 3 файла в фазе **09D**.
8. **Legacy migrations (`migrate:legacy`):** фаза **16** — **условный** cutover: только если после 09–15 нет raw-SQL причин держать legacy runner; иначе фиксируем blocker/backlog.
9. **Zod policy (фазы 09–15):** для всех затронутых DB-границ — Zod на JSON из БД (`system_settings`, jsonb payload), `safeParse` на внешние row-shapes; запрет `JSON.parse(raw) as unknown` без валидации.
10. **Integrator schema reduction:** фаза **08** **до** P1+ Drizzle; `public` = canonical business data, `integrator` = technical state only; drop/deprecate — senior review + owner approval + backup/rollback.

**Owner decisions (кратко):** `public` — главный источник бизнес-данных; дубли в `integrator`, покрытые `public`, можно отключать после review; живые интеграции Rubitime/Telegram/MAX/GCal — smoke перед закрытием соответствующих фаз.

#### Definition of Ready → фаза 09

- [x] `rg` baseline → Class A/B/C в RAW_SQL (2026-06-05)
- [x] Решения 1–10 и ADR permanent zones в LOG
- [x] `plans/README.md` + DRIZZLE_TRANSITION_PLAN → wave3_INDEX, phase 08, phase 16
- [x] Zod policy для DB-границ 09–15 зафиксирована

**PR map (кодовые фазы):** см. [`plans/wave3_INDEX.md`](./plans/wave3_INDEX.md) — 08 → (09 ∥ 10) → 11 → 12 → 13 → 14 → 15 → 16 (conditional) → 17.

### Wave 3 — фаза 08 (integrator schema reduction) — выполнено (2026-06-06)

Фаза закрыта как **non-destructive reduction**: удалений production-таблиц и destructive DB action не было. Senior-agent review + owner approval + backup/rollback/окно выката остаются обязательным gate перед любым будущим `DROP` / hard deprecate.

#### Runtime settings cutover

- `integrator.system_settings` больше не является runtime source of truth для integrator. Оставшиеся runtime-readers настроек читают **`public.system_settings`** явно:
  `config/appBaseUrl.ts`, `config/appTimezone.ts`, `config/smtpOutbound.ts`, `repos/operationalVerboseLog.ts`, `repos/linkedPhoneSource.ts`, `handlers/patientHomeMorningPing.ts`, `google-calendar/runtimeConfig.ts`.
- `settingsSyncRoute.ts` оставлен как legacy compatibility endpoint для подписанного `system_settings_sync`/cache invalidation, но запись зеркала явно квалифицирована как **`integrator.system_settings`** и больше не смешивается с runtime-read path.
- Webapp `syncSettingToIntegrator` / `integrator_push_outbox.kind = system_settings_sync` **не удалялись** в этой фазе: это отдельный cleanup после owner-approved cutover старого M2M-контракта.

#### Матрица решений по integrator-схеме

| Группа | Решение |
|--------|---------|
| `integrator.system_settings`, `settingsSyncRoute`, `syncSettingToIntegrator` | Runtime source removed; legacy mirror/sync = **deprecate candidate**, без удаления в phase08. |
| `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles`, `bookingProfilesRepo` | **move-to-public / deprecate candidate**; не мигрировать в phase09 ради Drizzle, нужен отдельный cutover на `public.booking_*` / booking-sync. |
| `rubitime_records` | **raw-audit-only / deprecate candidate**; business canon = `public.appointment_records` + `public.patient_bookings`; ops scripts остаются Class C. |
| `rubitime_events` | **keep technical audit** для webhook replay/debug. |
| `booking_calendar_map` | **move-to-public candidate**; сейчас thin map + sync `public.patient_bookings.gcal_event_id`, не расширять. |
| `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs` | **move-to-public candidate; dispatch-state review**; не расширять зеркало до отдельного dispatch-from-public design. |
| `users`, `identities`, `contacts`, `telegram_state` | **keep channel identity state**; не использовать как дубль public-профиля пациента. |
| `conversations`, `conversation_messages`, `message_drafts`, `user_questions`, `question_messages` | **review / transport-log only**; если public support canon покрывает бизнес-историю, integrator остаётся channel transport/log. |
| `projection_outbox`, `rubitime_create_retry_jobs`, delivery/audit logs, throttle/advisory/idempotency | **keep technical state**. |

#### Проверки

- `rg "FROM system_settings|INTO system_settings|UPDATE system_settings" apps/integrator/src --glob "*.ts"` → **0** unqualified matches.
- `rg "public\.system_settings|integrator\.system_settings" apps/integrator/src --glob "*.ts"` → только expected public reads + legacy sync route/test.
- Targeted: `pnpm --dir apps/integrator run test -- --run appTimezone operationalVerboseLog messengerStaffIds settingsSyncRoute patientHomeMorningPing runtimeConfig` — green; vitest фактически прогнал весь integrator suite: **149 files passed, 1038 tests passed, 6 skipped**.
- Typecheck: `pnpm --dir apps/integrator run typecheck` — green.
- Локальное предупреждение окружения: Node `v20.18.2` при требовании проекта `>=22`.

### Wave 3 — фаза 09A (settings/config foundation) — выполнено (2026-06-06)

#### Scope

- Добавлен общий helper `apps/integrator/src/infra/db/publicSystemSettings.ts`: чтение `public.system_settings` + Zod на envelope/scalar (`extractSystemSettingInnerValue`, `parseSystemSettingStringValue`, `parseSystemSettingTrueLiteral`, `parseSystemSettingInnerWithSchema`).
- Переведены на helper: `config/appBaseUrl.ts`, `config/appTimezone.ts`, `config/smtpOutbound.ts`, `repos/operationalVerboseLog.ts`, `repos/linkedPhoneSource.ts`, `integrations/google-calendar/runtimeConfig.ts`.
- Runtime-зависимость от `integrator.system_settings` не добавлялась; `settingsSyncRoute` не трогали.

#### Проверки

- `rg "JSON\.parse\(|as unknown" apps/integrator/src/config apps/integrator/src/infra/db/repos/linkedPhoneSource.ts apps/integrator/src/integrations/google-calendar/runtimeConfig.ts apps/integrator/src/infra/db/repos/operationalVerboseLog.ts` → **0** matches.
- Targeted tests: `appBaseUrl` (новый), `appTimezone`, `operationalVerboseLog`, `runtimeConfig` — green; полный integrator suite: **150 files passed, 1042 tests passed, 6 skipped**.
- Typecheck: `pnpm --dir apps/integrator run typecheck` — green.

### Wave 3 — фаза 09B–09E + verify (integrator P1+ closeout) — выполнено (2026-06-06)

#### 09B — simple repos

- `runIntegratorSql` + helper: `platformUserDeliveryPhone`, `resolvePlatformUserIdForRubitimeBooking`, `canonicalUserId`, `messengerStaffIds`, `adminIncidentAlertRelay` (Zod на id-lists и incident config).
- `linkedPhoneSource` уже на helper из 09A.

#### 09C — complex repos

- `idempotencyKeys`, `adminStats`, `integrationDataQualityIncidents`, `patientHomeMorningPing` (repo), `patientHomeMorningPing` handler (settings helper + Zod), `branchTimezone` (`public.booking_branches` / `public.branches` join сохранён).

#### 09D — google calendar

- `calendarDescription`, `resolvePackageCalendarContext` → `runIntegratorSql`; `runtimeConfig` — helper из 09A.

#### 09E — rubitime throttle

- `rubitimeApiThrottle`: Drizzle `execute(sql)` на том же `PoolClient` под advisory lock; интервал 5500 ms и unlock semantics без изменений.

#### Инфра

- `runIntegratorSql`: `PgDialect.sqlToQuery` + fallback на `db.query`; `public.system_settings` всегда через `DbPort.query`; пустые stub-execute без `rowCount` → fallback для unit-тестов.

#### Проверки (verify)

- `rg 'await db\.query' apps/integrator/src --glob '*.ts'` (exclude `migrate.ts`, scripts, `client.ts` health) → **0** prod matches.
- `pnpm --dir apps/integrator run test` — **150 files passed, 1042 tests passed, 6 skipped**.
- `pnpm --dir apps/integrator run typecheck` — green.

#### Post-audit closure (2026-06-06)

- **Zod id-lists:** общий `parseMessengerIdTokens.ts` (без `JSON.parse(...) as unknown`); `messengerStaffIds` / `adminIncidentAlertRelay` переведены на helper; JSON-массивы в строках — `JSON.parse` + `z.json().safeParse` на decoded value.
- **Idempotency whitelist:** экспорт `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES` в `idempotencyKeys.ts` (план ↔ код).
- **Тесты:** `parseMessengerIdTokens.test.ts`, `platformUserDeliveryPhone.test.ts`, `adminStats.test.ts`, `idempotencyKeys.test.ts`.
- **Проверки:** integrator suite **154 files / 1054 tests passed**; typecheck green.

### Wave 3 — фаза 10 (media-worker IX, 10A–10C) — выполнено (2026-06-06)

План: [wave3_phase_10_media_worker_ix.plan.md](./plans/wave3_phase_10_media_worker_ix.plan.md).

#### 10A — preflight (baseline + инварианты)

| Файл | Роль | `pool.query` (до 10B) |
|------|------|------------------------|
| `jobs/claim.ts` | **Class C permanent** — без изменений | 8 |
| `processTranscodeJob.ts` | target migration | 10 |
| `processProgramSubmissionTranscode.ts` | target migration | 7 |
| `watermarkEnabled.ts` | target migration + Zod | 1 |
| `pipelineEnabled.ts` | target migration + Zod | 1 |

**Инварианты поведения (не менять при миграции):**

- Статусы job: `pending` → `processing` (claim) → `done` \| `failed` \| retry `pending` с `next_attempt_at`.
- Retry: `backoffMsAfterFailure(attemptsAfterClaim)`; финальный fail при `attemptsAfterClaim >= maxAttempts`.
- Permanent fail: job `failed` + `media_files.video_processing_status = failed`; retryable — job `pending` + media `pending`.
- Feature flags: `public.system_settings` keys `video_hls_pipeline_enabled`, `video_watermark_enabled` (scope `admin`); default **false** при отсутствии/невалидном JSON.
- **claim.ts:** `FOR UPDATE SKIP LOCKED`, stale reclaim, ROLLBACK при race — **вне scope** фазы 10.

**Preflight checks:** `rg 'pool\.query' apps/media-worker/src` — inventory как выше; `pnpm --dir apps/media-worker run test -- claim` — green (claim **4**); полный suite после 10B — **22 passed**.

**Out of scope:** shared schema package (backlog вне Wave 3); webapp `pgMediaTranscodeJobs`; DDL.

#### 10B — runtime migration (Class B executor)

- Добавлен `runMediaWorkerSql.ts`: `runMediaWorkerSql` / `runMediaWorkerPgText` — Drizzle `sql` fragment → `PgDialect.sqlToQuery` → `pg.Pool.query` (без shared schema).
- `systemSettingBoolean.ts` + `parseSystemSettingBoolean` (Zod) для `value_json` admin flags.
- Мигрированы: `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` — SQL через executor; таблицы **`public.*`**.
- Тесты: `systemSettingBoolean.test.ts`, `watermarkEnabled.test.ts` (Zod invalid JSON).
- `claim.ts` — **без изменений**.
- Зависимость: `drizzle-orm` в `@bersoncare/media-worker` (только `sql` + dialect, не schema package).
- **`pnpm run ci`** — green (2026-06-06; lint fix `platformUserDeliveryPhone.test.ts` no-secrets для describe label).

**Verify:**

- `rg 'pool\.query' apps/media-worker/src --glob '*.ts'` → только `jobs/claim.ts`, transport в `runMediaWorkerSql.ts`, mock в `claim.test.ts`.
- `pnpm --dir apps/media-worker run test` — **22 passed** (claim **4**, settings **5**, `systemSettingBoolean` **2**).
- `pnpm --dir apps/media-worker run typecheck` — green.
- **`pnpm run ci`** — green (2026-06-06).

#### 10C — staging smoke pack (gate для фазы 17)

Исполнение smoke — **не** в фазе 10; чеклист для owner/ops в фазе **17**.

**Предусловия на staging/prod:**

- `video_hls_pipeline_enabled = true` в `public.system_settings` (admin).
- `bersoncarebot-media-worker-prod.service` active; webapp env: `DATABASE_URL`, S3, `INTERNAL_JOB_SECRET`.
- Тестовое видео ≤ лимита multipart (см. CMS / `HOST_DEPLOY_README.md`).

**Шаги (happy path — multipart → enqueue → claim → done):**

1. **Upload:** в CMS загрузить короткий `video/mp4` через multipart (или single PUT для малого файла) → confirm/complete.
2. **Enqueue (webapp):** при `video_hls_new_uploads_auto_transcode` job создаётся автоматически; иначе:
   ```bash
   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
   curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" \
     -H "Content-Type: application/json" \
     --data '{"mediaId":"<UUID>"}' \
     "http://127.0.0.1:6200/api/internal/media-transcode/enqueue"
   ```
   Ожидание: `{ "ok": true }` или `{ "ok": true, "skipped": "already_ready" }` / `alreadyQueued`.
3. **Claim + transcode (media-worker):** дождаться poll (секунды–минуты). Логи:
   - `journalctl -u bersoncarebot-media-worker-prod.service -f --since "5 min ago"`
   - события: `transcode completed` (`outcome: done`), или `transcode_job_retry` / `transcode_job_terminal` при сбое.
4. **Webapp enqueue path (при ручном enqueue):** `journalctl -u bersoncarebot-webapp-prod.service` — без 5xx на `/api/internal/media-transcode/enqueue`.

**SQL-проверки состояния (после шага 3):**

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT j.id, j.status, j.attempts, j.last_error,
       m.video_processing_status, m.hls_master_playlist_s3_key IS NOT NULL AS has_master
FROM public.media_transcode_jobs j
JOIN public.media_files m ON m.id = j.media_id
WHERE j.media_id = '<UUID>'::uuid
ORDER BY j.created_at DESC
LIMIT 3;"
```

**Pass criteria:**

| Проверка | Pass |
|----------|------|
| Job terminal `status = 'done'` | ✓ |
| `media_files.video_processing_status = 'ready'` | ✓ |
| `hls_master_playlist_s3_key` задан (HLS path) или `video_delivery_override = 'mp4'` (program submission) | ✓ |
| HEAD master/480p в S3 private bucket | ✓ |
| Нет зависших `processing` > reclaim TTL без активного worker | ✓ |

**Fail criteria (фиксировать в LOG фазы 17):** job `failed` с `last_error`; media `failed`; worker idle при `pipeline_enabled` и pending jobs; duplicate active jobs на один `media_id`.

**Rollback hints (runtime commit фазы 10):**

1. Откат git-коммита фазы 10; `pnpm --dir apps/media-worker build` на хосте; `systemctl restart bersoncarebot-media-worker-prod.service`.
2. Повторить `pnpm --dir apps/media-worker run test` (claim **4** + suite).
3. `rg 'pool\.query' apps/media-worker/src` — после отката снова hits в `processTranscodeJob*` (ожидаемо); **`claim.ts` diff должен быть пуст**.
4. Smoke: один короткий upload → убедиться job доходит до `done` (семантика claim/status не должна меняться при откате только executor-слоя, если SQL-текст эквивалентен).

**Shared schema package:** backlog вне Wave 3 (см. [wave3_DECISIONS.md](./plans/wave3_DECISIONS.md) §3).

### Wave 3 — фаза 11 (webapp app-layer + auth tail) — выполнено (2026-06-06)

План: [wave3_phase_11_webapp_app_layer_auth.plan.md](./plans/wave3_phase_11_webapp_app_layer_auth.plan.md).

#### 11.1 — app-layer health/media

- `collectAdminSystemHealthData.ts` — preview probe (`media_files` grouped + stale pending) → `runWebappPgText`.
- `adminTranscodeHealthMetrics.ts` — `loadMediaFilesCountsViaPool` → `runWebappPgText`; Drizzle-агрегаты transcode jobs без изменений.
- `videoHlsLegacyBackfill.ts` — batch fetch / histogram / failed reasons → `runPgPoolPgText` (pool inject для ops script).

#### 11.2 — auth transport + ESLint allowlist

- `channelLink.ts` — **Class C permanent:** только `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` для multipart tx с `platform-merge`; domain SQL — `runWebappPgText` / `getWebappSqlFromPgClient` (Wave 2 P7).
- ESLint allowlist **не сужен** — проверка `rg '@/infra/repos|@/infra/db'`:
  - `oauthWebSession.ts` — `@/infra/repos/pgUserByPhone`
  - `yandexOAuthCallbackHandler.ts` — `pgUserByPhone`, `pgOAuthBindings`, `pgPatientCalendarTimezone`
  - `service.ts` — dynamic import `pgUserByPhone`, `pgUserProjection`
  - `channelLink.ts` — `@/infra/db/client`, `@/infra/repos/pgChannelLinkClaim`, …
  - `configAdapter.ts` — allowlist сохранён (module-layer adapter; SQL через `runWebappPgText`, не прямой `getPool`)

#### 11.3 — small infra (≤6 query)

- **Infra:** `runWebappSql.ts` — добавлен `runPgPoolPgText` (Class B transport для injected `Pool`).
- **Мигрированы:** `pgDiaryPurge`, `pgAdminPlatformUserStats`, `strictPlatformUserPurge` (domain SQL), `pgRubitimeMapping` (legacy branch_services load), `pgPatientBroadcasts`, usage summaries (`pgRecommendations`, `pgTestSets`, `pgCourses`, `pgClinicalTests`), `loadPlatformUserChannelBindings`, `mergeAuditLabels`, `manualMergeIntegratorGate`, `platformUserNameMatchHints`, `mergePreviewIntegratorUserPresence` (`integrator.users`), `disableReminderMessengerTopic`, `loadWarmupsSectionSlugs`, `configAdapter`, `pgStore`.
- **Class C остаток:** `strictPlatformUserPurge` — TX `BEGIN`/`COMMIT`/`ROLLBACK` на dedicated client (advisory + `runWebappPurgeCoreInTransaction`).

#### 11.4 — Zod на JSON-границах

- `modules/system-settings/parseSettingValueJson.ts` — envelope + `sms_fallback_enabled`.
- `infra/idempotency/pgStore.ts` — `idempotencyResponseBodySchema` для `response_body`.

#### Verify

- `rg 'pool\.query|client\.query' apps/webapp/src/app-layer/health apps/webapp/src/app-layer/media --glob '*.ts'` — **0** hits.
- `rg 'pool\.query' apps/webapp/src/modules/auth/channelLink.ts` — **0** (только Class C `client.query` TX).
- Vitest `--project fast` (health/media/config/idempotency): **48 passed** — `adminTranscodeHealthMetrics`, `videoHlsLegacyBackfill`, `system-health/route`, `configAdapter`, `parseSettingValueJson`, `pgStore`, `mergePreviewIntegratorUserPresence`.
- `RAW_SQL_INVENTORY.md` — все 10 мелких repos из scope P11 помечены **Wave 3 P11 done**.
- `pnpm --dir apps/webapp run typecheck` — green.
- **`pnpm run ci`** — green (post-audit closure).

#### Post-audit closure (2026-06-06)

- Дополнены строки RAW_SQL: `pgAdminPlatformUserStats`, `pgRubitimeMapping`, `pgPatientBroadcasts`, `loadPlatformUserChannelBindings`, `mergeAuditLabels`, `manualMergeIntegratorGate`, `platformUserNameMatchHints`, `mergePreviewIntegratorUserPresence`, `loadWarmupsSectionSlugs`, `disableReminderMessengerTopic`.
- Unit-тесты: `parseSettingValueJson.test.ts`, `pgStore.test.ts` (invalid `response_body` → `{}`).

**Синхронизация документов (2026-06-06, post-audit):** [wave3_phase_11_webapp_app_layer_auth.plan.md](./plans/wave3_phase_11_webapp_app_layer_auth.plan.md) (полное закрытие + таблица миграций), [plans/README.md](./plans/README.md), [wave3_INDEX.md](./plans/wave3_INDEX.md), [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md), [docs/README.md](../README.md).

### Wave 3 phase 12A — `pgOnlineIntake.ts` (2026-06-06)

- **Scope:** `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — domain SQL → `runWebappPgText` / `getWebappSqlFromPgClient`; Class C transport (`BEGIN`/`COMMIT`/`ROLLBACK`) + `pgAdvisoryXactLockShared` без изменений.
- **Проверки:** `pool.query` — 0; `client.query` — 9× Class C TX. Vitest `--project fast` `pgOnlineIntake.advisoryLock.test.ts` — **5 passed** (advisory order lock→INSERT, ROLLBACK on domain failure, `changeStatus` TX без advisory).
- **RAW_SQL:** `pgOnlineIntake.ts` → **Wave 3 P12A done**; plan todo `w3-p12a-intake` → `completed`.

#### Post-audit closure 12A (2026-06-06)

- Тесты: порядок `pgAdvisoryXactLockShared` до первого INSERT; ROLLBACK при ошибке domain SQL; `changeStatus` Class C TX + `NOT_FOUND` rollback path.
- Opt-in devDb read-only: `pgOnlineIntake.devDb.integration.test.ts` — `listRequests`, `getById` null, round-trip при наличии строки (`RUN_ONLINE_INTAKE_DEV_DB=1`).
- Docs: plan §12A verify → `--project fast`; `wave3_INDEX.md` / `plans/README.md` — фаза 12 **in progress (12A done)**.
- Typecheck: `resolvePatientReminderGoTargets.ts` — добавлен import `DailyWarmupListEntry` (блокировал `pnpm --dir apps/webapp run typecheck`, не связан с intake).

### Wave 3 phase 12B — identity / phone bind (2026-06-06)

- **Scope:** `pgUserByPhone.ts`, `pgIdentityResolution.ts`, `pgPhoneMessengerBind.ts` + `identityPhoneRowSchemas.ts`, `identityPhoneSql.ts`.
- **Transport:** domain SQL → `runIdentityPoolPgText` / `runIdentityClientPgText` / `runPgPoolPgTextOnPool`; Class C TX (`BEGIN`/`COMMIT`/`ROLLBACK`, `SET CONSTRAINTS` в `createOrBind`); `asMessengerPhoneBindDb` → executor на том же `PoolClient`.
- **Zod:** row-shape для session/bind/secret/merge rows; `bindingsFromRows`, `mapPhoneMessengerBindSecretRow`, `parseUserRole`.
- **Проверки:** `pool.query` — 0 в трёх repos; `JSON.parse` / `as unknown` — 0. Vitest `--project fast` — **27 passed** (`pgUserByPhone`, `pgIdentityResolution`, `identityPhoneRowSchemas`, `phoneMessengerBind`).
- **RAW_SQL:** три файла → **Wave 3 P12B done**; plan todo `w3-p12b-identity-phone` → `completed`.

#### Post-audit closure 12B (2026-06-06)

- Zod input boundary: `parseChannelContext`, `parseFindOrCreateByChannelBindingParams`, `parseMessengerIdentityResolutionHints`; secret row enums (`channel_code`, `purpose`, `status`).
- Тесты: `pgUserByPhone.createOrBind.test.ts` (5) — existing binding, insert, ROLLBACK, merge conflict, invalid context; `pgIdentityResolution.test.ts` — insert_new, merge_before_bind, ROLLBACK, invalid channel; `identityPhoneRowSchemas.test.ts` — invalid row/secret; `pgUserByPhone.test.ts` — `getPhoneByUserId`, `findByUserId`.
- Vitest `--project fast` 12B suite — **42 passed**.

### Wave 3 phase 12C — integrator-merge route (2026-06-06)

- **Scope:** `app/api/doctor/clients/integrator-merge/route.ts` → thin handler; orchestration + SQL → `infra/integratorPlatformUserMerge.ts`, Zod → `integratorPlatformUserMergeSchemas.ts`.
- **Transport:** domain SQL → `runIdentityClientPgText`; Class C `client.query` (`BEGIN`/`COMMIT`/`ROLLBACK`) в service; integrator HTTP error body — Zod (`parseIntegratorMergeHttpError`), без `JSON.parse`/`as` в route.
- **Проверки:** route `pool.query`/`client.query` — **0**; Vitest `--project fast` 12C suite — **28 passed**; `pnpm --dir apps/webapp run typecheck` — green.
- **RAW_SQL:** route → **Wave 3 P12C done**; plan todo `w3-p12c-merge-route` → `completed`.

#### Post-audit closure 12C (2026-06-06)

- Тесты: service — precheck (`missing_user`, `not_client`, `alias_not_allowed`, `integrator_ids_not_divergent`), `integrator_unconfigured`, generic `integrator_merge_failed` + `details`, `orphan_clear_failed`, unexpected throw + ROLLBACK; route — `invalid_body`, `same_id`, `dryRun` passthrough; `integratorPlatformUserMergeSchemas.test.ts` — body/row/error parsers, `integratorUserIdNumericKey`.
- Parity: `parseIntegratorMergeHttpDetails` для operator `details` (любой JSON, иначе raw text); typed `parseIntegratorMergeHttpError` — только для `USER_NOT_FOUND` / loser-only ветки.
- Vitest `--project fast` 12C suite — **28 passed** (12 service + 9 schemas + 7 route).

### Wave 3 phase 12D — purge + merge preview (2026-06-06)

- **Scope:** `platformUserFullPurge.ts`, `platformUserMergePreview.ts`, `strictPlatformUserPurge.ts` + `platformUserPurgeSql.ts`.
- **Transport:** purge domain SQL → `runPurgeClientPgText` / `runPurgePoolPgText`; merge preview → `runPgPoolPgText`; Class C `client.query` — integrator purge TX (3×) + strict purge TX (3×) + advisory unchanged.
- **Проверки:** `pool.query` — 0 в `platformUserFullPurge` (webapp domain) и `platformUserMergePreview`; Vitest `--project fast` 12D suite — **34 passed**; opt-in devDb read-only preview smoke (`platformUserMergePreview.devDb.integration.test.ts`).
- **RAW_SQL:** три файла → **Wave 3 P12D done**; plan todo `w3-p12d-purge-preview` → `completed`.

#### Post-audit closure 12D (2026-06-06)

- Тесты: `platformUserFullPurge.bridge` — phone-keyed deletes, integrator projection; `platformUserMergePreview.load` — `searchMergeCandidates`, `searchMergeUsersForManualMerge`; devDb read-only — `platformUserFullPurge.devDb.integration.test.ts` (unknown id + row load); preview devDb — empty query skip DB, phone search SELECT, `same_id` без writes.
- Vitest `--project fast` 12D suite — **40 passed** (5 bridge + 7 load + 16 analyze + 12 strict).

### Wave 3 phase 12E — phase verify (2026-06-06)

- **Scope:** финальный `rg` по всем файлам фазы 12; `app-layer/platform-user/resolveOrCreateUserByPhone.ts`, `recordPublicBookingMergeCandidates.ts` → `runPgPoolPgText`.
- **Проверки:** `pool.query` — **0** по 11 scope-файлам; Class C `client.query` — intake 9×, integrator merge 11×, purge integrator 3×, strict purge 3×; Vitest `--project fast` phase-12 bundle — **115 passed**; typecheck green.
- **RAW_SQL / plan:** фаза 12 `status: completed`; todo `w3-p12-verify` → `completed`; DoD фазы — все пункты `[x]`.
- **Re-verify (2026-06-06):** повторный прогон блока 12E — `pool.query` 0, bundle **115 passed**; `plans/README.md` / `wave3_INDEX.md` синхронизированы (**фаза 12 completed**).

#### Post-audit tails closure (2026-06-06)

- DevDb intake smoke: `pgOnlineIntake.devDb.integration.test.ts` (`RUN_ONLINE_INTAKE_DEV_DB=1`).
- DevDb purge/preview расширены: unknown-id null, `searchMergeUsersForManualMerge` empty/non-empty query.
- `client.query` в `pgOnlineIntake.ts`: 9× runtime Class C TX + 1× JSDoc (не расхождение с планом).

### Wave 3 phase 12 — итог (completed, 2026-06-06)

| Подфаза | Scope | Проверка |
|---------|-------|----------|
| **12A** | `pgOnlineIntake.ts` → `runWebappPgText`; advisory + Class C TX | 5 advisory tests; opt-in devDb read-only |
| **12B** | `pgUserByPhone`, `pgIdentityResolution`, `pgPhoneMessengerBind` + Zod | 42 tests |
| **12C** | thin `integrator-merge` route → `integratorPlatformUserMerge.ts` | 28 tests |
| **12D** | `platformUserFullPurge`, `platformUserMergePreview`, `strictPlatformUserPurge`, `platformUserPurgeSql` | 40 tests; opt-in devDb purge/preview |
| **12E** | scope `rg pool.query` = 0 (11 файлов); `app-layer/platform-user/*` | **115 passed** CI bundle; typecheck green |

**Новые/ключевые файлы:** `integratorPlatformUserMerge.ts`, `integratorPlatformUserMergeSchemas.ts`, `platformUserPurgeSql.ts`, `identityPhoneRowSchemas.ts`, `identityPhoneSql.ts`.

**Opt-in devDb (read-only, не в CI по умолчанию):** `RUN_ONLINE_INTAKE_DEV_DB=1`, `RUN_PURGE_DEV_DB=1`, `RUN_MERGE_PREVIEW_DEV_DB=1` + `USE_REAL_DATABASE=1` + `DATABASE_URL`.

**Вне scope (без изменений):** `packages/platform-merge` merge engine.

**Документация синхронизирована:** plan 12, `wave3_INDEX`, `plans/README`, `DRIZZLE_TRANSITION_PLAN`, `RAW_SQL_INVENTORY`, `docs/README.md`.

**Следующая фаза Wave 3:** [wave3_phase_13_webapp_booking_doctor.plan.md](./plans/wave3_phase_13_webapp_booking_doctor.plan.md).

### Wave 3 phase 13A — booking catalog core (2026-06-06)

- **Scope:** `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — все read/write/admin paths (37 call sites).
- **Transport:** domain SQL → `runWebappPgText` (Drizzle `execute(sql)`); `syncBranchesTimezoneFromCatalog` — тот же канал.
- **Hardening:** `deactivate*` → `(rowCount ?? 0) > 0`; unit-тесты EXISTS/branch_not_found/deactivate rowCount; opt-in devDb read-only smoke (`RUN_BOOKING_CATALOG_DEV_DB`).
- **Проверки:** `rg "pool\\.query|client\\.query" pgBookingCatalog.ts` — **0**; Vitest `--project fast pgBookingCatalog` — **15 passed**.
- **RAW_SQL / plan:** todo `w3-p13a-catalog-read-write` → `completed`.

### Wave 3 phase 13B — patient bookings + appointments (2026-06-06)

- **Scope:** `pgPatientBookings.ts`, `pgDoctorAppointments.ts`, `pgAppointmentProjection.ts`, `pgBookingCalendarLegacy.ts`.
- **Transport:** domain SQL → `runWebappPgText`; `pgPatientBookings.upsertFromRubitime` — `getPool()` → `booking-rubitime-sync` (инвариант P8).
- **Class C:** `pgAppointmentProjection.softDeleteByIntegratorId` — `BEGIN`/`COMMIT`/`ROLLBACK` на PoolClient; domain UPDATE — `runWebappPgText` + `getWebappSqlFromPgClient`.
- **Проверки:** `pool.query` = 0 в scope-файлах (кроме Class C transport); Vitest fast bundle — **37 passed**; `booking-rubitime-sync` — **27 passed**.
- **Post-audit (2026-06-06):** legacy calendar + projection repo tests; patient bookings status/get tests; opt-in devDb read-only (`RUN_PATIENT_BOOKINGS_DEV_DB`); RAW_SQL row `pgBookingCalendarLegacy`.
- **RAW_SQL / plan:** todo `w3-p13b-bookings-appointments` → `completed`.

### Wave 3 phase 13C — doctor clients + analytics (2026-06-06)

- **Scope:** `pgDoctorClients.ts`, `pgDoctorAnalyticsMetricAccounts.ts`, `createDoctorClient.ts`, `pgDoctorNotes.ts`, `pgBranches.ts`.
- **Transport:** domain SQL → `runWebappPgText`; `resolveCanonicalUserId` / `findCanonicalUserIdByPhone` — по-прежнему `Pool | PoolClient`.
- **Class C:** `createDoctorClient` — INSERT + phone history в TX; transport `BEGIN`/`COMMIT`/`ROLLBACK` на PoolClient.
- **Проверки:** `pool.query` = 0 в scope repos (кроме Class C transport в `createDoctorClient`); Vitest fast bundle 13C — **52 passed**.
- **Tests:** mock `runWebappPgText`; parity table 26 metric keys; repo/createDoctorClient edge cases; opt-in devDb `RUN_DOCTOR_CLIENTS_DEV_DB` / `RUN_DOCTOR_ANALYTICS_DEV_DB`.
- **RAW_SQL / plan:** todo `w3-p13c-doctor-clients-analytics` → `completed`.

