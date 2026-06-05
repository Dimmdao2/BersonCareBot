---
name: Wave2 Phase06 Webapp LFK
overview: Перевести pgLfkExercises, pgLfkTemplates, pgLfkDiary, pgLfkAssignments и связанные list-запросы на Drizzle с поэтапным выносом динамических фильтров (+sql или views).
status: completed
isProject: false
todos:
  - id: p06-crud-first
    content: "Сначала CRUD и простые select по id; убрать pool.query там где прямой маппинг; зафиксировать регрессию через существующие или новые unit-тесты."
    status: completed
  - id: p06-list-queries
    content: "Динамические list-SQL: по умолчанию оставить параметризованный sql + Drizzle execute с whitelist; builder использовать только для простых фильтров без потери читаемости; benchmark нужен при изменении JOIN/order/filter формы."
    status: completed
  - id: p06-templates-diary
    content: "pgLfkTemplates.ts, pgLfkDiary.ts: транзакции reorder/удаления; не нарушать врачебные шаблоны и пациентский дневник."
    status: completed
  - id: p06-verify
    content: "webapp typecheck + P6 vitest bundle (27) + pnpm run ci; rg pgLfk*.ts на pool.query; smoke в LOG."
    status: completed
---

# Wave 2 — этап 6: webapp ЛФК (каталог / дневник / назначения)

## Размер

**L**

## Definition of Done

- [x] Основные операции каталога и дневника не завязаны на сырой `pool.query`, кроме осознанно оставленных list-хелперов с тестом/комментарием.
- [x] Нет регресса в patient/doctor flows по smoke-чеклисту: doctor catalog CRUD, template reorder/delete, patient diary/session read+write, assignment list.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgLfk*.ts` из инвентаризации; `apps/webapp/src/infra/db/runWebappSql.ts` (`webappSqlFromPgText`, `runWebappPgText`).

**Вне scope:** переименование пользовательских строк «ЛФК» в UX (отдельное правило продукта); DDL каталога без миграции.

## Пациентский UX

Терминология «программа реабилитации» не смешивать с возвратом «комплекса» как главной сущности (см. `.cursor/rules/patient-lfk-means-rehab-program.mdc` — для текстов, не блокер этого этапа).

## Декомпозиция исполнения

### 1. Inventory and grouping

- [x] Сверить `RAW_SQL_INVENTORY.md` по `pgLfk*.ts` и текущий `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos --glob "pgLfk*.ts"`.
- [x] Разделить запросы на группы: CRUD by id, list/filter, template reorder, diary/session, assignments.
- [x] Перед кодом зафиксировать, какие list helpers остаются `execute(sql)` с комментарием.

### 2. Schema and types

- [x] Проверить Drizzle declarations для `lfk_exercises`, `lfk_exercise_media`, `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complexes`, `lfk_complex_exercises`, `lfk_sessions`, `patient_lfk_assignments`.
- [x] Не добавлять DDL без миграции и отдельного rollout note.
- [x] Сохранить public API repo methods и return shape.

### 3. CRUD-first pass

- [x] `pgLfkExercises.ts`: create/update/archive/read by id/media relation.
- [x] `pgLfkAssignments.ts`: assignment read/write/status transitions.
- [x] Простые `select`/`insert`/`update` — `runWebappPgText` / `runWebappTransaction`; list/usage — параметризованный `execute(sql)`.
- [x] Тесты: create/update/archive, assignment status, not-found/null.

### 4. Templates and reorder

- [x] `pgLfkTemplates.ts`: template CRUD, exercises inside template, reorder/delete in transaction.
- [x] Сохранить позиционирование и uniqueness constraints.
- [x] Тесты: reorder stable order, delete removes expected rows only, template clone/read shape.

### 5. Diary and sessions

- [x] `pgLfkDiary.ts`: session create/update/list, patient diary reads.
- [x] Сохранить patient-scoped filters и date ordering.
- [x] Тесты: `pgLfkDiary.test.ts` (list/get/add/update/delete scoping, date range, comment truncate).

### 6. Dynamic list queries

- [x] Для каждого list endpoint применить правило: simple filters — builder; dynamic joins/sort/search — `execute(sql)` с параметрами.
- [x] Whitelist для sort/filter identifiers; ни один пользовательский фильтр не попадает в SQL identifier без whitelist.
- [x] Benchmark не требовался: query shape (JOIN/filter/order) не менялся.

### 7. Verification

- [x] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos --glob "pgLfk*.ts"` — остатки объяснены.
- [x] `pnpm --dir apps/webapp run typecheck`
- [x] Целевые LFK tests (`pgLfk*.test.ts` + `e2e/lfk-assign-inprocess.test.ts`).
- [x] `pnpm run ci` — green (post-audit).
- [x] LOG smoke: doctor catalog CRUD, template reorder/delete, patient diary/session read+write, assignment list.

## Решения по сложным местам

- Динамические list-запросы по умолчанию остаются `execute(sql)` с whitelist sort/filter identifiers; builder не является обязательной целью.
- Template reorder/delete переносить transaction-by-transaction, сохраняя порядок delete/update/insert.
- Пользовательские строки и patient UX не менять; терминологическое правило только предотвращает добавление новых legacy UX текстов.
- Старые таблицы каталога ЛФК используются как есть; новый LFK engine не проектируется.

## Stop conditions

- Если нужен DDL для LFK таблиц, остановиться и оформить migration rollout.
- Если list query требует смены API shape или фильтров UI, вынести в отдельную product/UI задачу.
- Если reorder нельзя покрыть тестом на стабильный порядок, не закрывать соответствующий todo.

## Закрытие

- **Инфра:** `runWebappSql.ts` — `webappSqlFromPgText` / `runWebappPgText` (мост `$1..$n` → Drizzle `execute(sql)`).
- **Репозитории:** `pgLfkExercises.ts`, `pgLfkTemplates.ts`, `pgLfkDiary.ts`, `pgLfkAssignments.ts` — DML/read через `runWebappPgText` / `runWebappTransaction`; динамические list/usage — параметризованный SQL без смены shape.
- **Транзакции:** create/update упражнений и `updateExercises` шаблона — **`runWebappTransaction`** (без ручного `PoolClient` BEGIN/COMMIT).
- **Остаток сырого SQL:** **`pool.query` / `client.query` — 0** в `pgLfk*.ts`.
- **Тесты (vitest, P6 bundle):** **27 passed** — `pgLfkAssignments`, `pgLfkExercises`, `pgLfkTemplates`, `pgLfkDiary` (+ e2e inMemory diary smoke).
- **Проверки:** `pnpm --dir apps/webapp run typecheck`; **`pnpm run ci`** — green (post-audit).
- **Документация:** [LOG.md](../LOG.md) § Wave 2 этап 6; [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md); [plans/README.md](./README.md); [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md).
