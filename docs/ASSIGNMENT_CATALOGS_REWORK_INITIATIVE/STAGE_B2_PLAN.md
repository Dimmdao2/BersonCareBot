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

## 5. Контракты данных (обязательная фиксация в коде)

Перед реализацией зафиксировать в типах и комментариях:

1. `assessment_kind`:
   - nullable в БД;
   - enum v1 по PRE-решению.
2. `body_region_id`:
   - nullable FK на справочник регионов;
   - при `NULL` фильтр не матчится на конкретный регион.
3. `scoring` (новый JSONB):
   - обязательный корневой `schema_type`;
   - для `numeric|likert|binary` — валидируемые поля и диапазоны;
   - для `qualitative` — без авто-оценки.
4. `raw_text`:
   - nullable fallback для legacy/нестандартизируемых данных.
5. migration policy:
   - `scoring_config` не удаляем;
   - перенос best-effort, невалидные куски уезжают в `raw_text`.

## 6. B2.5 (внутри этапа) — критерии готовности компонента

- Popover + live filter; «+ Добавить …» при отсутствии совпадения; `onCreate` async.
- Без обязательного `cmdk` (как в ТЗ); не тянуть новую UI-библиотеку.
- Клавиатурный сценарий: ввод → стрелки/Enter → выбор/создание.
- Ошибки create (409/422/500) показываются рядом с полем без падения формы.

## 7. Декомпозиция реализации

1. **Schema & migration**
   - добавить колонки `assessment_kind`, `body_region_id`, `scoring`, `raw_text`;
   - добавить таблицу `clinical_test_measure_kinds`;
   - migration/backfill `scoring_config` -> `scoring` + `raw_text`.
2. **Domain / repo / API**
   - обновить типы `ClinicalTest`, filters, create/update inputs;
   - обновить repo read/write paths с новым контрактом;
   - реализовать `GET/POST /api/doctor/measure-kinds`.
3. **UI clinical tests**
   - `ClinicalTestForm`: schema_type sections, measure_items list, raw_text, json-toggle;
   - `ClinicalTestsPageClient`: фильтры `assessmentKind` + регион.
4. **Shared component**
   - `CreatableComboboxInput` + unit tests (фильтр/выбор/создание/ошибка).
5. **Verification**
   - migration tests + targeted compose/smoke.

## 8. Execution checklist

1. [x] Схема + миграции (нерушащие NULL/default).
2. [x] Backfill scoring + тесты парсера legacy → new.
3. [x] `CreatableComboboxInput` + unit-тесты.
4. [x] API measure-kinds + интеграция в форму.
5. [x] Форма + список + фильтры.
6. [x] Negative paths: create measure-kind conflict/invalid input не ломают форму.
7. [x] `eslint` / `vitest` / `tsc` по затронутой области.
8. [x] Smoke: создание/редактирование теста для всех 4 `schema_type`.
9. [x] Smoke: фильтр по региону и `assessmentKind` реально меняет выдачу.

## 9. Recommended checks (targeted)

```bash
rg "assessment_kind|body_region_id|clinical_test_measure_kinds|scoring_config|schema_type" apps/webapp/db apps/webapp/src
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <clinical-tests-related-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

Если перед пушем полный `ci` упал на webapp-тестах по B2, сначала исправить и перезапустить упавшие файлы, затем использовать `pnpm run ci:resume:after-test-webapp`.

## 10. Stage DoD

- Критерии ТЗ §6 для B2 выполнены.
- Запись в [`LOG.md`](LOG.md); закрытые Q зафиксированы.
- В AUDIT есть таблица: migration/backfill/API/UI/tests с PASS/FAIL доказательствами.
