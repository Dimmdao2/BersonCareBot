# STAGE B2 PLAN — Клинические тесты: типизация, scoring, CreatableCombobox (B2.5)

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Типизировать клинические тесты (`assessmentKind`, `body_region`), заменить JSON-first scoring на структурированную модель с legacy-миграцией, добавить **`CreatableComboboxInput`** и глобальный справочник **`measure_kinds`** с read/create API.

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.2, §2.10, §3 B2 + **B2.5**.

## 2. Hard gates before coding

- **Q1, Q2, Q6** закрыты инженерно по [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) §1 (стартовый enum; Q2 не тянет инстансный UX в B2; measure_kinds append-only). При отличии от врача — зафиксировать в `LOG.md` + §8 продуктового ТЗ.

## 3. In scope / out of scope

### In scope

- Drizzle: колонки на `clinical_tests` (`assessment_kind`, `body_region_id`, `scoring`, `raw_text`); сохранение legacy `scoring_config` как в ТЗ.
- Таблица `clinical_test_measure_kinds` + миграция backfill при необходимости.
- Модуль констант/подписей `assessmentKind` (аналог паттерна `loadType`).
- `ClinicalTestForm.tsx`: поля по `schema_type`, блок `measure_items`, toggle JSON-режима, `ReferenceSelect` для региона.
- `ClinicalTestsPageClient`: фильтр по региону и `assessmentKind`.
- **`CreatableComboboxInput`**: shared компонент + тесты; `GET/POST` measure-kinds API под докторскую сессию.
- Миграция данных `scoring_config` → новая структура (best-effort, остаток в `raw_text`).

### Out of scope

- Удаление колонки `scoring_config` — backlog ТЗ §7.
- Админ-модерация пула `measure_kinds` — вне v1 (см. `PRE_IMPLEMENTATION_DECISIONS`, Q6).

## 4. Likely files

- [`apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx)
- `apps/webapp/src/modules/tests/**` (новый файл вида `clinicalTestAssessmentKind.ts`)
- `apps/webapp/src/shared/ui/CreatableComboboxInput.tsx` + `*.test.tsx`
- `apps/webapp/src/app/api/doctor/measure-kinds/**` (или согласованный путь в `api/doctor/`)
- `apps/webapp/db/schema/*clinical*`

## 5. B2.5 (внутри этапа) — критерии готовности компонента

- Popover + live filter; «+ Добавить …» при отсутствии совпадения; `onCreate` async.
- Без обязательного `cmdk` (как в ТЗ); не тянуть новую UI-библиотеку.

## 6. Execution checklist

1. [ ] Схема + миграции (нерушащие NULL/default).
2. [ ] Backfill scoring + тесты парсера legacy → new.
3. [ ] `CreatableComboboxInput` + unit-тесты.
4. [ ] API measure-kinds + интеграция в форму.
5. [ ] Форма + список + фильтры.
6. [ ] `eslint` / `vitest` / `tsc` по затронутой области.

## 7. Stage DoD

- Критерии ТЗ §6 для B2 выполнены.
- Запись в [`LOG.md`](LOG.md); закрытые Q зафиксированы.
