---
name: Wave2 Phase04 Webapp reminders
overview: Перевести все pgReminder* repos с pool/client raw SQL на Drizzle в apps/webapp/src/infra/repos с сохранением транзакционной семантики и связей с integrator_user_id.
status: pending
isProject: false
todos:
  - id: p04-ports-contract
    content: "Зафиксировать контракты портов modules/reminders (или соседних) — входы/выходы без изменения публичного API маршрутов."
    status: pending
  - id: p04-projection
    content: "pgReminderProjection.ts: миграция read/write на Drizzle; интеграционные проверки рассинхрона integrator_user_id."
    status: pending
  - id: p04-rules-journal
    content: "pgReminderRules.ts, pgReminderJournal.ts: транзакции BEGIN/COMMIT через drizzle transaction; snooze и множественные апдейты — тесты на порядок операций."
    status: pending
  - id: p04-webpush-cooldown
    content: "pgWebPushOnlyReminders.ts и pgReminderTransactionalEmailCooldown.ts: входят в scope этапа 4; заменить pool/client raw SQL на Drizzle или задокументированный execute(sql) без изменения web-push/email cooldown поведения."
    status: pending
  - id: p04-verify
    content: "webapp: typecheck + целевые тесты (расширить существующие или добавить узкие); rg pool.query/client.query по pgReminder*.ts и pgWebPushOnlyReminders.ts в зоне этапа."
    status: pending
---

# Wave 2 — этап 4: webapp напоминания

## Размер

**L**

## Definition of Done

- [ ] Все reminder repos этапа (`pgReminderProjection.ts`, `pgReminderRules.ts`, `pgReminderJournal.ts`, `pgReminderTransactionalEmailCooldown.ts`, `pgWebPushOnlyReminders.ts`) не используют `pool.query`/`client.query` для доменной логики (кроме явно задокументированного исключения).
- [ ] Тесты покрывают критичные ветки (snooze, журнал, синхронизация правил).
- [ ] LOG: краткий итог и известные ограничения.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgReminder*.ts`, `apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts`, `buildAppDeps` wiring, тесты в `apps/webapp`.

**Вне scope:** изменение схемы БД напоминаний без миграции; логика integrator-side reminders.

## Архитектура

Работа только в `infra/repos`; модули — без прямого Drizzle ([DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md)).

## Декомпозиция исполнения

### 1. Baseline contracts

- [ ] Выписать публичные методы repos и ports, которые используют reminder modules/routes.
- [ ] Зафиксировать поля, где участвует `integrator_user_id`, `rule_id`, occurrence id, delivery id и topic code.
- [ ] Проверить существующие тесты `pgReminderProjection.test.ts`, `pgReminderRules.test.ts` и coverage по journal/webpush/cooldown.

### 2. Schema and transaction helpers

- [ ] Проверить, что все reminder tables есть в webapp Drizzle schema; если нет — добавить только schema declarations без DDL.
- [ ] Завести локальный helper для Drizzle transaction там, где сейчас ручной `BEGIN`/`COMMIT`.
- [ ] Для `now()`/interval arithmetic использовать Drizzle `sql` fragments с теми же выражениями, что legacy SQL.

### 3. `pgReminderProjection.ts`

- [ ] Перевести write paths: upsert projection, mark delivery state, delete/cleanup.
- [ ] Перевести read paths: occurrence context, active rule lookup, counters.
- [ ] Тесты: рассинхрон `integrator_user_id`, not-found, duplicate idempotency, stale occurrence.

### 4. `pgReminderRules.ts`

- [ ] Перевести CRUD правил и list queries.
- [ ] Перевести transaction reorder/delete/update цепочки без изменения порядка операций.
- [ ] Тесты: create/update/delete, snooze-related fields, topic/category mapping.

### 5. `pgReminderJournal.ts`

- [ ] Перевести append journal event с идемпотентностью.
- [ ] Перевести snooze/skip transactions; сохранить ранние rollback branches.
- [ ] Тесты: duplicate journal insert, day counters, snooze until calculation, skip already skipped.

### 6. `pgWebPushOnlyReminders.ts`

- [ ] Перевести выбор due reminders и state updates.
- [ ] Сохранить фильтры только web-push канала и idempotency constraints.
- [ ] Тесты: due selection, no target, sent/fail state transition.

### 7. `pgReminderTransactionalEmailCooldown.ts`

- [ ] Перевести cooldown read/update на Drizzle.
- [ ] Сохранить race-safe update semantics.
- [ ] Тесты: cooldown hit, cooldown miss, update timestamp.

### 8. Закрытие этапа

- [ ] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgReminder*.ts apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts`
- [ ] `pnpm --dir apps/webapp run typecheck`
- [ ] Целевые reminder tests; если добавлены inprocess e2e — следовать политике webapp tests lean.
- [ ] LOG: что переведено, какие raw `execute(sql)` оставлены и почему.

## Решения по сложным местам

- Ручные rollback branches в journal/rules переносить через Drizzle transaction с явными ранними `return`; каждый ранний выход покрыть тестом.
- `integrator_user_id` не пересчитывать и не “чинить” в этом этапе; только сохранять текущие lookup/update rules.
- Web Push-only flow (`pgWebPushOnlyReminders.ts`) переводить отдельно от general reminders; idempotency и cron selection тестируются отдельно.
- `now()`/timezone/interval expressions сохранять через `sql` fragments с тем же SQL-текстом, если builder меняет вычисление времени.

## Stop conditions

- Если перенос требует DDL для reminder tables, остановиться и оформить migration-plan.
- Если обнаружен рассинхрон `integrator_user_id`, не чинить внутри Drizzle PR; записать incident/backlog и оставить поведение эквивалентным.
- Если web-push-only cron semantics меняется, вынести в отдельный reminder rollout.
