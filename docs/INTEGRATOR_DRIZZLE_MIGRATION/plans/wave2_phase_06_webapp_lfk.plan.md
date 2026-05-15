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
    content: "Динамические list-SQL: либо оставить параметризованный sql + Drizzle execute, либо декомпозиция на builder; benchmark на типичном фильтре (замер в LOG при необходимости)."
    status: pending
  - id: p06-templates-diary
    content: "pgLfkTemplates.ts, pgLfkDiary.ts: транзакции reorder/удаления; не нарушать врачебные шаблоны и пациентский дневник."
    status: pending
  - id: p06-verify
    content: "webapp typecheck + тесты зоны LFK; rg по файлам этапа на pool.query."
    status: pending
---

# Wave 2 — этап 6: webapp ЛФК (каталог / дневник / назначения)

## Размер

**L**

## Definition of Done

- [ ] Основные операции каталога и дневника не завязаны на сырой `pool.query`, кроме осознанно оставленных list-хелперов с тестом/комментарием.
- [ ] Нет регресса в patient/doctor flows по чеклисту приёмки (кратко в PR).

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/pgLfk*.ts` из инвентаризации.

**Вне scope:** переименование пользовательских строк «ЛФК» в UX (отдельное правило продукта); DDL каталога без миграции.

## Пациентский UX

Терминология «программа реабилитации» не смешивать с возвратом «комплекса» как главной сущности (см. `.cursor/rules/patient-lfk-means-rehab-program.mdc` — для текстов, не блокер этого этапа).
