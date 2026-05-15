# Integrator Drizzle migration — execution log

## 2026-05-14

- Заведена инициатива: мастер-план и поэтапные планы в **`.cursor/plans/integrator_drizzle_migration_*.plan.md`** (корень `.cursor/plans/`). Закрытые планы репозитория — **`.cursor/plans/archive/`** ([README](../../.cursor/plans/archive/README.md)).
- Контекст: в интеграторе уже есть Drizzle только для операторских таблиц через `@bersoncare/operator-db-schema` (`getIntegratorDrizzle`); остальные репозитории пока на `DbPort` / сырой SQL.

## 2026-05-15

- Глобальный бэклог **«Integrator — один каталог записи (убрать дубль `integrator.rubitime_*`)»** — в [`docs/TODO.md`](../TODO.md) (раздел после Rubitime API2 фазы 2); пересекается с этапами Drizzle-репозиториев и cutover v1/v2.

### Этап 1 (P1 repos) — выполнено

- **Стратегия схемы (`schema-strategy`, мастер-план):** для этапа 1 принят **локальный дубль** — узкие `pgTable` в `apps/integrator/src/infra/db/schema/integratorPublicProduct.ts` сверены с `apps/webapp/db/schema/schema.ts` (колонки, уникальные ограничения; для `delivery_attempt_logs` — те же btree-индексы и CHECK `attempt > 0`, `status ∈ {success,failed}`). Зависимость от пакета webapp не добавлялась. Регистрация: `integratorDrizzleSchema.ts` + `getIntegratorDrizzle()` / `getIntegratorDrizzleSession()` в `apps/integrator/src/infra/db/drizzle.ts` (вместе с `@bersoncare/operator-db-schema`). **Backlog:** вынести общий набор таблиц в workspace-пакет по образцу `operator-db-schema`, когда дубль станет шире P1.
- **Переведены на Drizzle:** `repos/subscriptions.ts`, `topics.ts`, `booking_calendar_map` в `repos/bookingCalendarMap.ts` (обновление `public.patient_bookings` остаётся `db.query`), `mailingLogs.ts`, `messageLogs.ts` (таблица **`delivery_attempt_logs`**; не путать с несуществующим именем `message_logs`).
- **Транзакции:** на `DbPort` внутри `createDbPort().tx` добавлено поле `integratorDrizzle` (тот же `pg` client); репозитории используют `getIntegratorDrizzleSession(port)` — без отката на пул внутри TX.
- **Валидация перед INSERT в `delivery_attempt_logs`:** в `messageLogs.ts` отсекаются строки с невалидными `channel` / `status` / `attempt` (до вызова Drizzle), чтобы не полагаться на небезопасные приведения типов.
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `pnpm --dir apps/integrator run test`.
- **Тесты:** заглушка `stubIntegratorDrizzleForTests.ts` для writePort/unit-тестов с мок-`DbPort`.
- **Вне P1-repos, осознанный сырой SQL:** `mergeIntegratorUsers.ts` — `user_subscriptions` / `mailing_logs` при merge пользователей (этап 4 мастер-плана).

### Этап 2 (outbox + job queue) — выполнено

- **Схема:** `apps/integrator/src/infra/db/schema/integratorQueues.ts` — `projection_outbox`, `rubitime_create_retry_jobs` (колонки и индексы как в `apps/webapp/db/schema/schema.ts`: partial `idx_projection_outbox_due`, unique `idx_projection_outbox_idempotency_key`, `idx_rubitime_create_retry_jobs_due`). Регистрация в `integratorDrizzleSchema.ts`.
- **`projectionOutbox.ts`:** `enqueueProjectionEvent` — Drizzle `insert` + `onConflictDoNothing`; `claimDueProjectionEvents` — **`getIntegratorDrizzleSession(db).execute(sql\`…\`)`** с прежним CTE + `FOR UPDATE SKIP LOCKED` + `RETURNING` с camelCase алиасами; `complete` / `fail` / `reschedule` — `update` + `eq`, для `next_try_at`/`updated_at` — фрагменты `sql` с тем же выражением интервала, что и в legacy.
- **`jobQueue.ts`:** `enqueueMessageRetryJob` — `insert` + `sql` для `next_try_at`; `claimDueMessageRetryJobs` — **`execute(sql\`…\`)`** (аналогичный claim-паттерн); `reschedule` / `complete` / `fail` — `update`.
- **Транзакции:** по-прежнему `getIntegratorDrizzleSession(port)` (в т.ч. внутри `createDbPort().tx`).
- **Тесты:** моки `getIntegratorDrizzleSession` в `projectionOutbox.test.ts`, `jobQueuePort.test.ts`; `projectionFanout.test.ts` и writePort-тесты — `stubIntegratorDrizzleForTests(capture)` на **корневом** `DbPort` (fanout после TX вызывает enqueue на root `db`); в stub добавлен **`onConflictDoUpdate`** для `mailing_logs` в том же tx.
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `pnpm --dir apps/integrator run test`.
- **Вне этапа 2:** сырой SQL в `projectionHealth.ts`, `mergeIntegratorUsers.ts` (projection payload), `scripts/projection-health.mjs` — без изменений в этом этапе.

### Постаудит этапа 2 (2026-05-15)

- **`rubitime_create_retry_jobs`:** отмена pending/processing jobs по `bookingId` (напоминания при отмене записи) перенесена из сырого SQL в `recordM2mRoute.ts` в репозиторий — `cancelPendingBookingReminderJobsByBookingId` в `repos/jobQueue.ts` (Drizzle `update` + `and` / `inArray` / `eq` / `sql` по JSON path), единый канал с остальной очередью.
- **Тесты:** удалены мёртвые ветки перехвата `INSERT INTO projection_outbox` через `db.query` в writePort-тестах; `stubIntegratorDrizzleForTests` — capture только для `insert(projectionOutbox)`; assert на наличие `FOR UPDATE SKIP LOCKED` в аргументе `execute` для claim в `projectionOutbox.test.ts` и `jobQueuePort.test.ts`; добавлен `jobQueue.test.ts` на cancel; в `recordM2mRoute.test.ts` мок `jobQueue.js` расширен экспортом `cancelPendingBookingReminderJobsByBookingId`.
- **План:** `.cursor/plans/integrator_drizzle_phase_2_outbox_job_queue.plan.md` — todo `p2-audit-hardening`, секция «Постаудит», уточнение формулировки про эквивалентность claim-SQL.

### Этап 3 (доменные репозитории) — выполнено

- **Схема:** `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts` — `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `content_access_grants`, `rubitime_records`, `rubitime_events`, `appointment_records` (локальный `pgTable` без `pgSchema('public')` — совместимость Drizzle). Регистрация в `integratorDrizzleSchema.ts`.
- **Переведены на Drizzle:** `repos/reminders.ts` (чтения/апдейты через `getIntegratorDrizzleSession`; сложные выборки `getDueReminderOccurrences`, `getStaleReminderMessengerMessageIdForResend` — `execute(sql\`…\`)` с прежними JOIN/JSON), `repos/bookingRecords.ts`, `repos/publicAppointmentRecordSync.ts` (`insert(appointmentRecords).onConflictDoUpdate`).
- **Тесты:** расширен `stubIntegratorDrizzleForTests.ts` (`returning`, цепочки `select`/`join`/`where`/`orderBy`/`limit`); `readPort.test.ts` — тип `MockDbPort` для `query.mockResolvedValue`; `writePort.reminders.test.ts` — `vi.mock` на `getReminderOccurrenceContextForProjection` (стаб контекста проекций при unit-stub Drizzle); `reminders.staleMessenger.test.ts` — развёртка `sql` через `queryChunks` для assert по тексту SQL.
- **Проверки:** `pnpm --dir apps/integrator run lint`, `typecheck`, `test`.

### Постаудит этапа 3 (2026-05-15)

- **План:** `.cursor/plans/integrator_drizzle_phase_3_domain_repos.plan.md` — в frontmatter добавлено `status: completed`; YAML выровнен под стиль этапов 1–2 (`overview`/`content` через `>-`); DoD уточнён формулировкой «без сырого SQL через `db.query(...)`».
- **Код:** у `getDueReminderOccurrences` в `repos/reminders.ts` — JSDoc с пометкой escape hatch (`execute(sql)` + cross-schema JOIN), в духе DoD этапа 3.
- **Тесты:** `writePort.reminders.test.ts` по-прежнему мокает `getReminderOccurrenceContextForProjection` для стабильной fanout-проекции при stub Drizzle — осознанный trade-off unit-слоя (см. детальный аудит закрытия этапа).
