---
name: Wave2 Phase06 Webapp LFK
overview: Перевести pgLfkExercises, pgLfkTemplates, pgLfkDiary, pgLfkAssignments и связанные list-запросы на Drizzle с поэтапным выносом динамических фильтров (+sql или views).
status: pending
isProject: false
todos:
  - id: p06-crud-first
    content: "Сначала CRUD и простые select по id; убрать pool.query там где прямой маппинг; зафиксировать регрессию через существующие или новые unit-тесты."
    status: pending
  - id: p06-list-queries
    content: "Динамические list-SQL: по умолчанию оставить параметризованный sql + Drizzle execute с whitelist; builder использовать только для простых фильтров без потери читаемости; benchmark нужен при изменении JOIN/order/filter формы."
    status: pending
  - id: p06-templates-diary
    content: "pgLfkTemplates.ts, pgLfkDiary.ts: транзакции reorder/удаления; не нарушать врачебные шаблоны и пациентский дневник."
    status: pending
  - id: p06-verify
    content: "webapp typecheck + тесты зоны LFK; rg по файлам этапа на pool.query; smoke-чеклист в LOG: doctor catalog CRUD, template reorder/delete, patient diary/session read, assignment list."
    status: pending
---

# Wave 2 — этап 6: webapp ЛФК (каталог / дневник / назначения)

## Размер

**L**

## Definition of Done

- [ ] Основные операции каталога и дневника не завязаны на сырой `pool.query`, кроме осознанно оставленных list-хелперов с тестом/комментарием.
- [ ] Нет регресса в patient/doctor flows по smoke-чеклисту: doctor catalog CRUD, template reorder/delete, patient diary/session read, assignment list.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgLfk*.ts` из инвентаризации.

**Вне scope:** переименование пользовательских строк «ЛФК» в UX (отдельное правило продукта); DDL каталога без миграции.

## Пациентский UX

Терминология «программа реабилитации» не смешивать с возвратом «комплекса» как главной сущности (см. `.cursor/rules/patient-lfk-means-rehab-program.mdc` — для текстов, не блокер этого этапа).

## Декомпозиция исполнения

### 1. Inventory and grouping

- [ ] Сверить `RAW_SQL_INVENTORY.md` по `pgLfk*.ts` и текущий `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos --glob "pgLfk*.ts"`.
- [ ] Разделить запросы на группы: CRUD by id, list/filter, template reorder, diary/session, assignments.
- [ ] Перед кодом зафиксировать, какие list helpers остаются `execute(sql)` с комментарием.

### 2. Schema and types

- [ ] Проверить Drizzle declarations для `lfk_exercises`, `lfk_exercise_media`, `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complexes`, `lfk_complex_exercises`, `lfk_sessions`, `patient_lfk_assignments`.
- [ ] Не добавлять DDL без миграции и отдельного rollout note.
- [ ] Сохранить public API repo methods и return shape.

### 3. CRUD-first pass

- [ ] `pgLfkExercises.ts`: create/update/archive/read by id/media relation.
- [ ] `pgLfkAssignments.ts`: assignment read/write/status transitions.
- [ ] Простые `select`/`insert`/`update` перевести на builder до list queries.
- [ ] Тесты: create/update/archive, assignment status, not-found/null.

### 4. Templates and reorder

- [ ] `pgLfkTemplates.ts`: template CRUD, exercises inside template, reorder/delete in transaction.
- [ ] Сохранить позиционирование и uniqueness constraints.
- [ ] Тесты: reorder stable order, delete removes expected rows only, template clone/read shape.

### 5. Diary and sessions

- [ ] `pgLfkDiary.ts`: session create/update/list, patient diary reads.
- [ ] Сохранить patient-scoped filters и date ordering.
- [ ] Тесты: session write, list by patient/date, empty state.

### 6. Dynamic list queries

- [ ] Для каждого list endpoint применить правило: simple filters — builder; dynamic joins/sort/search — `execute(sql)` с параметрами.
- [ ] Whitelist для sort/filter identifiers; ни один пользовательский фильтр не попадает в SQL identifier без whitelist.
- [ ] Benchmark нужен только если меняется query shape с JOIN/filter/order; результат записать в LOG.

### 7. Verification

- [ ] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos --glob "pgLfk*.ts"` — остатки объяснены.
- [ ] `pnpm --dir apps/webapp run typecheck`
- [ ] Целевые LFK tests.
- [ ] LOG smoke: doctor catalog CRUD, template reorder/delete, patient diary/session read, assignment list.

## Решения по сложным местам

- Динамические list-запросы по умолчанию остаются `execute(sql)` с whitelist sort/filter identifiers; builder не является обязательной целью.
- Template reorder/delete переносить transaction-by-transaction, сохраняя порядок delete/update/insert.
- Пользовательские строки и patient UX не менять; терминологическое правило только предотвращает добавление новых legacy UX текстов.
- Старые таблицы каталога ЛФК используются как есть; новый LFK engine не проектируется.

## Stop conditions

- Если нужен DDL для LFK таблиц, остановиться и оформить migration rollout.
- Если list query требует смены API shape или фильтров UI, вынести в отдельную product/UI задачу.
- Если reorder нельзя покрыть тестом на стабильный порядок, не закрывать соответствующий todo.
