---
name: Wave2 Phase04 Webapp reminders
overview: Перевести pgReminderProjection, pgReminderRules, pgReminderJournal с pool/client raw SQL на Drizzle в apps/webapp/src/infra/repos с сохранением транзакционной семантики и связей с integrator_user_id.
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
  - id: p04-verify
    content: "webapp: typecheck + целевые тесты (расширить существующие или добавить узкие); rg pool.query в этих файлах = 0."
    status: pending
---

# Wave 2 — этап 4: webapp напоминания

## Размер

**L**

## Definition of Done

- [ ] Три файла `pgReminder*.ts` не используют `pool.query`/`client.query` для доменной логики (кроме явно задокументированного исключения).
- [ ] Тесты покрывают критичные ветки (snooze, журнал, синхронизация правил).
- [ ] LOG: краткий итог и известные ограничения.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgReminder*.ts`, `buildAppDeps` wiring, тесты в `apps/webapp`.

**Вне scope:** изменение схемы БД напоминаний без миграции; логика integrator-side reminders.

## Архитектура

Работа только в `infra/repos`; модули — без прямого Drizzle ([DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md)).
