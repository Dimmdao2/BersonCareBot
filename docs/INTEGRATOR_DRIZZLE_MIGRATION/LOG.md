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
- **На момент записи P1:** `mergeIntegratorUsers.ts` и прочий «тяжёлый» SQL **не входили** в scope этапа 1; их перенос запланирован как **этап 4** мастер-плана. Фактическое состояние после P4 — см. раздел **«Этап 4»** ниже (там же инвентаризация конструкций).

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

- В корневом **`eslint.config.mjs`** **нет** отдельного правила, запрещающего **`db.query(...)`** по всему `apps/integrator` (только ограничения `no-restricted-imports` для `domain` / `telegram` / `worker`). Контроль канона SQL для переведённых репо — **DoD этапных планов** и ревью; автоматический запрет на весь пакет не вводился, чтобы не ломать миграции, скрипты и осознанный backlog (`outgoingDeliveryQueue`, `projectionHealth` и др.).

### Закрытие инициативы

- Этапы **P1–P4** и **мастер-план** закрыты; целевые репозитории плана не используют для своей доменной логики строковый **`db.query(...)`** (Drizzle API и/или **`runIntegratorSql` / `execute(sql)`**).
- После выравнивания: **`pnpm --dir apps/integrator run lint`**, **`typecheck`**, **`test`** — зелёные.
- Вне scope этой инициативы (отдельный backlog при необходимости): **`outgoingDeliveryQueue.ts`**, **`platformUserDeliveryPhone.ts`**, **`canonicalUserId.ts`**, **`linkedPhoneSource.ts`**, а также скрипты/health вне списка мастера (`projectionHealth`, `projection-health.mjs` и т.п.).

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

### Wave 2 — этап 1 (integrator tail SQL) — выполнено

- **Scope-факт:** `rg` по `apps/integrator/src/infra/db/repos`, `integrations`, `config`, `infra/runtime` показал целевые остатки фазы 1 в `outgoingDeliveryQueue.ts`, `notificationDeliveryAttempts.ts`, `messengerPhoneBindAudit.ts`, `settingsSyncRoute.ts`, `bookingProfilesRepo.ts`, `outgoingDeliveryWorker.ts`. Оставшиеся `client.query` после этапа — только advisory-lock зона **фазы 3** (`schedulerLocks.ts`, `rubitimeApiThrottle.ts`) и тестовый `.query(true)` в nock.
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
- **Вне этапа 3 (осознанно):** `modules/auth/*RateLimit.ts`, `publicBookingRateLimit.ts` — этап 7 Wave 2; остальной SQL в `s3MediaStorage.ts` — этап 5.

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
- **Остаток:** сырой `pg_advisory_xact_lock` в `modules/auth/*RateLimit.ts` и `publicBookingRateLimit.ts` — **Wave 2 этап 7**.
- **План:** `docs/INTEGRATOR_DRIZZLE_MIGRATION/plans/wave2_phase_03_advisory_locks.plan.md` — `status: completed`, секция «Закрытие».

### Wave 2 — этап 4 (webapp напоминания) — выполнено (2026-06-05)

- **Инфра:** `apps/webapp/src/infra/db/runWebappSql.ts` — `runWebappSql`, `runWebappTransaction`, тип `WebappSqlTransactionExecutor` с `tx.rollback()` (ранние выходы journal/rules/delete без throw).
- **Репозитории:** `pgReminderRules.ts`, `pgReminderJournal.ts`, `pgWebPushOnlyReminders.ts` (включая `cancelWebPushOnlyPendingOccurrencesForRule`, claim `FOR UPDATE SKIP LOCKED`); `pgReminderProjection.ts` — upsert/read/mark seen через `execute(sql)`; `pgReminderTransactionalEmailCooldown.ts` — Drizzle ORM на `email_send_cooldowns`.
- **Ограничение:** в `pgReminderProjection` остаётся `getPool()` только для вызовов `findCanonicalUserIdByIntegratorId` / `loadWarmupsSectionSlugs` (внешние хелперы, без `pool.query` в SQL projection).
- **Тесты (vitest `--project fast`, 8 файлов):** **36 passed** — PG: `pgReminderProjection.pg.test.ts`, `pgReminderRules.test.ts`, `pgReminderJournal.pg.test.ts`, `pgWebPushOnlyReminders.pg.test.ts`, `pgReminderTransactionalEmailCooldown.test.ts`; in-memory/contract: `pgReminderProjection.test.ts`, `pgWebPushOnlyReminders.test.ts`, `inMemoryReminderJournal.test.ts`.
- **Проверки:** `pnpm exec tsc --noEmit` (webapp); `rg 'pool\.query|client\.query'` по `apps/webapp/src/infra/repos/pgReminder*.ts` и `pgWebPushOnlyReminders.ts` — **0**; `RAW_SQL_INVENTORY.md` — P4 done для projection/rules/journal/webpush/cooldown.
- **План:** [wave2_phase_04_webapp_reminders.plan.md](./plans/wave2_phase_04_webapp_reminders.plan.md) — `status: completed`, todos и DoD закрыты.
