---
name: Wave2 Phase04 Webapp reminders
overview: Перевести все pgReminder* repos с pool/client raw SQL на Drizzle в apps/webapp/src/infra/repos с сохранением транзакционной семантики и связей с integrator_user_id.
status: completed
isProject: false
todos:
  - id: p04-ports-contract
    content: "Зафиксировать контракты портов modules/reminders (или соседних) — входы/выходы без изменения публичного API маршрутов."
    status: completed
  - id: p04-projection
    content: "pgReminderProjection.ts: миграция read/write на runWebappSql; unit-тесты canonical lookup и idempotency (pgReminderProjection.pg.test.ts), без DB integration рассинхрона."
    status: completed
  - id: p04-rules-journal
    content: "pgReminderRules.ts, pgReminderJournal.ts: транзакции BEGIN/COMMIT через drizzle transaction; snooze и множественные апдейты — тесты на порядок операций."
    status: completed
  - id: p04-webpush-cooldown
    content: "pgWebPushOnlyReminders.ts и pgReminderTransactionalEmailCooldown.ts: входят в scope этапа 4; заменить pool/client raw SQL на Drizzle или задокументированный execute(sql) без изменения web-push/email cooldown поведения."
    status: completed
  - id: p04-verify
    content: "webapp: typecheck + целевые тесты (расширить существующие или добавить узкие); rg pool.query/client.query по pgReminder*.ts и pgWebPushOnlyReminders.ts в зоне этапа."
    status: completed
---

# Wave 2 — этап 4: webapp напоминания

## Размер

**L**

## Definition of Done

- [x] Все reminder repos этапа (`pgReminderProjection.ts`, `pgReminderRules.ts`, `pgReminderJournal.ts`, `pgReminderTransactionalEmailCooldown.ts`, `pgWebPushOnlyReminders.ts`) не используют `pool.query`/`client.query` для доменной логики (кроме явно задокументированного исключения).
- [x] Тесты покрывают критичные ветки (snooze, журнал, синхронизация правил).
- [x] LOG: краткий итог и известные ограничения.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgReminder*.ts`, `apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts`, `buildAppDeps` wiring, тесты в `apps/webapp`.

**Вне scope:** изменение схемы БД напоминаний без миграции; логика integrator-side reminders.

## Архитектура

Работа только в `infra/repos`; модули — без прямого Drizzle ([DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md)).

## Декомпозиция исполнения

### 1. Baseline contracts

- [x] Выписать публичные методы repos и ports, которые используют reminder modules/routes.
- [x] Зафиксировать поля, где участвует `integrator_user_id`, `rule_id`, occurrence id, delivery id и topic code.
- [x] Проверить существующие тесты `pgReminderProjection.test.ts`, `pgReminderRules.test.ts` и coverage по journal/webpush/cooldown.

### 2. Schema and transaction helpers

- [x] Проверить, что все reminder tables есть в webapp Drizzle schema; если нет — добавить только schema declarations без DDL.
- [x] Завести локальный helper для Drizzle transaction там, где сейчас ручной `BEGIN`/`COMMIT`.
- [x] Для `now()`/interval arithmetic использовать Drizzle `sql` fragments с теми же выражениями, что legacy SQL.

### 3. `pgReminderProjection.ts`

- [x] Перевести write paths: upsert projection, mark delivery state, delete/cleanup.
- [x] Перевести read paths: occurrence context, active rule lookup, counters.
- [x] Тесты: рассинхрон `integrator_user_id`, not-found, duplicate idempotency, stale occurrence.

### 4. `pgReminderRules.ts`

- [x] Перевести CRUD правил и list queries.
- [x] Перевести transaction reorder/delete/update цепочки без изменения порядка операций.
- [x] Тесты: create/update/delete, snooze-related fields, topic/category mapping.

### 5. `pgReminderJournal.ts`

- [x] Перевести append journal event с идемпотентностью.
- [x] Перевести snooze/skip transactions; сохранить ранние rollback branches.
- [x] Тесты: duplicate journal insert, day counters, snooze until calculation, skip already skipped.

### 6. `pgWebPushOnlyReminders.ts`

- [x] Перевести выбор due reminders и state updates.
- [x] Сохранить фильтры только web-push канала и idempotency constraints.
- [x] Тесты: due selection, no target, sent/fail state transition.

### 7. `pgReminderTransactionalEmailCooldown.ts`

- [x] Перевести cooldown read/update на Drizzle.
- [x] Сохранить race-safe update semantics.
- [x] Тесты: cooldown hit, cooldown miss, update timestamp.

### 8. Закрытие этапа

- [x] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgReminder*.ts apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts`
- [x] `pnpm --dir apps/webapp run typecheck`
- [x] Целевые reminder tests; если добавлены inprocess e2e — следовать политике webapp tests lean.
- [x] LOG: что переведено, какие raw `execute(sql)` оставлены и почему.

## Решения по сложным местам

- Ручные rollback branches в journal/rules переносить через Drizzle transaction с явными ранними `return`; каждый ранний выход покрыть тестом.
- `integrator_user_id` не пересчитывать и не “чинить” в этом этапе; только сохранять текущие lookup/update rules.
- Web Push-only flow (`pgWebPushOnlyReminders.ts`) переводить отдельно от general reminders; idempotency и cron selection тестируются отдельно.
- `now()`/timezone/interval expressions сохранять через `sql` fragments с тем же SQL-текстом, если builder меняет вычисление времени.

## Stop conditions

- Если перенос требует DDL для reminder tables, остановиться и оформить migration-plan.
- Если обнаружен рассинхрон `integrator_user_id`, не чинить внутри Drizzle PR; записать incident/backlog и оставить поведение эквивалентным.
- Если web-push-only cron semantics меняется, вынести в отдельный reminder rollout.

## Закрытие (2026-06-05)

- **Инфра:** `apps/webapp/src/infra/db/runWebappSql.ts` — `runWebappSql`, `runWebappTransaction`, `WebappSqlTransactionExecutor` с `tx.rollback()`.
- **Репозитории:** `pgReminderRules.ts`, `pgReminderJournal.ts`, `pgWebPushOnlyReminders.ts` (+ `cancelWebPushOnlyPendingOccurrencesForRule`); `pgReminderProjection.ts` — доменный SQL через `execute(sql)`; `pgReminderTransactionalEmailCooldown.ts` — Drizzle builder на `email_send_cooldowns`.
- **Исключение (документировано):** `pgReminderProjection` по-прежнему вызывает `getPool()` только для `findCanonicalUserIdByIntegratorId` / `loadWarmupsSectionSlugs` (внешние хелперы, не `pool.query` внутри projection SQL).
- **Тесты (vitest `--project fast`):** **36 passed** в 8 файлах — PG: `pgReminderProjection.pg.test.ts`, `pgReminderRules.test.ts`, `pgReminderJournal.pg.test.ts`, `pgWebPushOnlyReminders.pg.test.ts`, `pgReminderTransactionalEmailCooldown.test.ts`; in-memory/contract: `pgReminderProjection.test.ts`, `inMemoryReminderJournal.test.ts`, `pgWebPushOnlyReminders.test.ts`.
- **Документация:** [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) § Wave 2 этап 4; [RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) — P4 done для всех reminder repos этапа.
- **Проверки (воспроизводимые):**
  - `rg 'pool\.query|client\.query' apps/webapp/src/infra/repos/pgReminder*.ts apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts` → пусто
  - `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json`
  - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgReminderProjection.pg.test.ts src/infra/repos/pgReminderProjection.test.ts src/infra/repos/pgReminderRules.test.ts src/infra/repos/pgReminderJournal.pg.test.ts src/infra/repos/pgWebPushOnlyReminders.pg.test.ts src/infra/repos/pgWebPushOnlyReminders.test.ts src/infra/repos/pgReminderTransactionalEmailCooldown.test.ts src/infra/repos/inMemoryReminderJournal.test.ts --project fast`
