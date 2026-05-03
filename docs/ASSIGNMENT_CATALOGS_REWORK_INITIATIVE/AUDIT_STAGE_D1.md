# AUDIT_STAGE_D1 — ASSIGNMENT_CATALOGS_REWORK (defer closure)

**Дата:** 2026-05-03  
**Scope:** Stage D1 — `measure_kinds` как управляемый системный справочник (Q6 step-1)  
**Source plan:** [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md), [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md)

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Добавлены `PATCH` для порядка/подписей, страница `/app/doctor/references/measure-kinds`, паритет port/pg/in-memory, unit-тесты сервиса, combobox в форме клин. теста следует `sort_order` с сервера и подписывается на событие обновления каталога.

## 2. Findings (pre-FIX) — закрыто

| ID | Severity | Описание | Закрытие |
|----|----------|----------|----------|
| D1-C1 | **Critical** | Не было управленческого API и UI для правки порядка/подписей `measure_kinds` (только `GET`/`POST`). | **`PATCH /api/doctor/measure-kinds`**, сервис `saveMeasureKindsOrderAndLabels`, страница **measure-kinds** в разделе справочников врача. |
| D1-M1 | **Major** | В `ClinicalTestMeasureRowsEditor` список для combobox сортировался по алфавиту, игнорируя **`sort_order`** из БД. | Загрузка: сортировка по **`sortOrder`** (и подписи как tie-break); после создания — **`reloadToken`** для согласования с сервером. |

## 3. Scope Verification

| Requirement | Source | Status | Evidence |
|---------------|--------|--------|----------|
| Управление списком (label + sort), без merge/dedup | STAGE_D1_PLAN | **PASS** | `saveMeasureKindsOrderAndLabels` + UI DnD; код строки только для чтения. |
| Валидация пустой подписи | STAGE_D1_PLAN §6 | **PASS** | Сервис + `422` из route; тест `measureKindsService.test.ts`. |
| Паритет port / pg / inMemory | Архитектура | **PASS** | `measureKindsPorts.ts`, `pgClinicalTestMeasureKinds.ts`, `inMemoryClinicalTestMeasureKinds.ts`. |
| Doctor/admin доступ | `canAccessDoctor` | **PASS** | Те же guards, что у `GET`/`POST`; admin в роли doctor shell. |
| Источник правды — API measure-kinds | STAGE_D1_PLAN | **PASS** | Форма и страница справочника используют те же эндпоинты. |
| Без миграции структуры таблицы | STAGE_D1_PLAN out-of-scope | **PASS** | Таблица `clinical_test_measure_kinds` без изменений схемы. |

## 4. Architecture Rules

- [x] `modules/tests` — порт и сервис; route тонкий → `buildAppDeps().measureKinds`.
- [x] Нет новых env для интеграций.
- [x] Drizzle-only мутации в PG-репозитории.

## 5. Minor — deferred (с обоснованием)

| ID | Minor | Решение | Обоснование |
|----|-------|---------|-------------|
| D1-m1 | E2E (Playwright) сценарий «правка в справочнике → combobox на форме теста» | **Deferred** | В репозитории нет принятого E2E-контура для doctor CMS; покрытие unit + ручной smoke. |
| D1-m2 | Колонка **`is_active` / архив** для строк `measure_kinds` | **Deferred** | В схеме B2 нет поля архива; удаление/скрытие строк ссылающихся на `scoring` — отдельный продуктовый шаг (вне D1 «без merge»). |

## 6. Test Evidence (целевые)

```bash
cd apps/webapp
pnpm exec vitest run src/modules/tests/measureKindsService.test.ts
pnpm exec eslint \
  src/modules/tests/measureKindsPorts.ts \
  src/modules/tests/measureKindsService.ts \
  src/modules/tests/measureKindsService.test.ts \
  src/modules/tests/measureKindsClientEvent.ts \
  src/infra/repos/pgClinicalTestMeasureKinds.ts \
  src/infra/repos/inMemoryClinicalTestMeasureKinds.ts \
  src/app/api/doctor/measure-kinds/route.ts \
  src/app/app/doctor/references/ReferencesSidebar.tsx \
  src/app/app/doctor/references/layout.tsx \
  src/app/app/doctor/references/measure-kinds/page.tsx \
  src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx
pnpm exec tsc --noEmit
```

## 7. DoD (Stage D1)

- [x] Управление из UI.
- [x] Негативные пути (пустой label, устаревший набор id) не ломают контракт API.
- [x] Каталог клинических тестов: combobox согласован с порядком БД и обновляется при изменениях каталога (событие + refetch).
