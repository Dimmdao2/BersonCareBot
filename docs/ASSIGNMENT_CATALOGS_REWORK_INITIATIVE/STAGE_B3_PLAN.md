# STAGE B3 PLAN — Наборы тестов: редактор как LFK-комплекс

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Переписать редактор состава набора тестов: карточки с превью, порядок, комментарий на item, диалог библиотеки по образцу конструктора программ; удалить UUID-textarea из сценариев полностью.

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.5, §3 B3.

## 2. Hard gates before coding

- **B1** закрыт с двухосевой фильтрацией, включая публикационный статус `test_sets`.
- **Q5** закрыт: UUID-textarea и toggle «Сырой режим» удаляются полностью.

## 3. In scope / out of scope

### In scope

- Полная переработка [`TestSetItemsForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx).
- Drizzle: `test_set_items.comment TEXT NULL` (имя согласовать с B7 — template comment).
- Server action / batch save по паттерну LFK-комплекса.
- Диалог «добавить тест» — по образцу `TreatmentProgramConstructorClient` library dialog.
- **DnD:** в проекте уже используется `@dnd-kit` в [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) — для сортировки строк набора **не** вводить вторую библиотеку; переиспользовать тот же стек при переносе паттерна.
- Удаление legacy UUID textarea из страницы/формы/подсказок/путей сохранения.

### Out of scope

- Поля reps/sets/side/pain (упражнения, не тесты).
- Домен групп этапа программы (A3).
- Любой fallback-режим редактирования состава через сырой UUID-текст.

## 4. Likely files

- `apps/webapp/src/app/app/doctor/test-sets/**`
- `apps/webapp/src/modules/tests/**` (port для comment, если нужен)
- `apps/webapp/db/schema/*test*set*`

## 5. Декомпозиция реализации

1. **Schema**
   - `test_set_items.comment` migration;
   - согласование имени с B7 (template-level comment).
2. **Form/UI**
   - карточки items + drag-handle + comment + remove;
   - library dialog add flow;
   - удаление UUID textarea.
3. **Actions/validation**
   - батч-сохранение порядка + комментариев;
   - валидация дубликатов/архивных тестов/пустого состава.
4. **Regression**
   - list/detail сохранение query фильтров из B1;
   - archive/usage безопасность.
5. **Verification**
   - compose/server-action tests + targeted lint/typecheck.

## 6. Execution checklist

1. [ ] Миграция `comment` на `test_set_items`.
2. [ ] Новый UI списка + DnD порядка.
3. [ ] Диалог библиотеки + добавление/удаление.
4. [ ] UUID textarea полностью удалён (UI + серверные ожидания).
5. [ ] Compose-тесты / server action тесты по объёму изменений.
6. [ ] Регресс usage/archive для наборов (см. [`../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md)).

## 7. Stage DoD

- Критерии ТЗ §6 для B3.
- [`LOG.md`](LOG.md) обновлён.
