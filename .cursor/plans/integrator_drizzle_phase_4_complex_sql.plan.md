---
name: Integrator Drizzle — этап 4 (сложный SQL)
overview: Последним блоком перевести messageThreads, channelUsers и mergeIntegratorUsers — CTE, LATERAL, identity/merge-потоки; максимально использовать Drizzle, допускать целевой sql только с полным сохранением логики.
status: completed
todos:
  - id: p4-inventory
    content: "Инвентаризация конструкций (CTE, LATERAL, merge/outbox) и решение builder vs sql template: таблица «Инвентаризация P4» в docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md (раздел этапа 4); итог — runIntegratorSql + drizzle-orm sql шаблоны."
    status: completed
  - id: p4-message-threads
    content: Перевести messageThreads.ts; обновить messageThreads.test.ts
    status: completed
  - id: p4-channel-users
    content: Перевести channelUsers.ts (включая setUserPhone lookup); channelUsers.test.ts
    status: completed
  - id: p4-merge-users
    content: Перевести mergeIntegratorUsers.ts; mergeIntegratorUsers.test.ts
    status: completed
  - id: p4-verify
    content: apps/integrator lint + typecheck + test; LOG.md; закрытие мастер-плана
    status: completed
isProject: false
---

# Этап 4: сложный SQL последним (P4)

## Связь с мастер-планом

Предпосылки: закрыты [этапы 1–3](integrator_drizzle_migration_master.plan.md). Это финальный кодовый этап мастер-плана до полного DoD.

## Scope

**Разрешено**

- [`messageThreads.ts`](../../apps/integrator/src/infra/db/repos/messageThreads.ts) + [`messageThreads.test.ts`](../../apps/integrator/src/infra/db/repos/messageThreads.test.ts)
- [`channelUsers.ts`](../../apps/integrator/src/infra/db/repos/channelUsers.ts) + [`channelUsers.test.ts`](../../apps/integrator/src/infra/db/repos/channelUsers.test.ts)
- [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts) + [`mergeIntegratorUsers.test.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.test.ts)
- Drizzle schema / регистрация таблиц, участвующих только в этих путях

**Вне scope:** любые изменения продуктовой семантики merge (правила победителя пользователя), кроме багфиксов, явно найденных при переводе.

## Подход

1. Не упрощать запрос ради Drizzle если это меняет план или граничные случаи (NULL, дубликаты, race).
2. Допустим **целостный** `db.execute(sql\`...\`)` с параметризацией через `sql.raw`/`placeholder` по правилам drizzle-orm, если builder неэкономен; строка SQL должна быть максимально близка к исходной, diff в review обязателен.
3. Цель этапа — убрать разбросанные template-строки из `DbPort.query` в пользу централизованных Drizzle/sql фрагментов с типизированными входами/выходами где это реально.

## Чек-лист

- [x] Для merge: прогнать сценарии тестов на конфликт идентичности / канонического user id.
- [x] Для threads/channel: проверить индексы и `LIMIT`/`ORDER BY` на соответствие текущему поведению списков.
- [x] Полный прогон `pnpm --dir apps/integrator run test` перед закрытием мастера.

## Definition of Done (этап 4 и финал мастера)

- [x] Три целевых репозитория не используют `db.query(<строковый шаблон>)` для доменной логики (Drizzle `runIntegratorSql` / `sql`).
- [x] Все перечисленные тесты зелёные.
- [x] Мастер-план: `phase-4`, `dod-master` — `completed`; LOG.md содержит итоговую сводку инициативы.
