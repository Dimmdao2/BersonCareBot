# AUDIT_STAGE_B2 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B2 + B2.5 (клинические тесты: `scoring` / `raw_text`, `measure_kinds`, форма, фильтры каталога)  
**Source plan:** [`STAGE_B2_PLAN.md`](STAGE_B2_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B2, [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md)

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Схема additive и backfill подтверждены; форма и API measure-kinds — ок. Закрыты риски аудита: ошибка загрузки `GET measure-kinds` показывается в UI с «Повторить»; `GET /api/doctor/clinical-tests` принимает `region` и `assessment` с валидацией; невалидный `?assessment=` на странице каталога даёт заметный статус-баннер; unit-тесты на combobox и редактор строк.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| Additive schema, без удаления `scoring_config` | ТЗ B2, EXECUTION_RULES | **PASS** | [`clinicalTests.ts`](../../../../apps/webapp/db/schema/clinicalTests.ts) — колонки `scoring`, `raw_text`, `assessment_kind`, `body_region_id`; `scoring_config` остаётся; таблица `clinical_test_measure_kinds` |
| Обратная совместимость чтения | B2 | **PASS** | [`pgClinicalTests.ts`](../../../../apps/webapp/src/infra/repos/pgClinicalTests.ts) `deriveScoring` / `deriveRawText`: приоритет `scoring`, fallback `scoring_config` через `migrateLegacyScoringConfig` |
| Backfill `scoring_config` → `scoring` / `raw_text` | B2 | **PASS** (с оговоркой) | [`0034_clinical_tests_b2_scoring_measure_kinds.sql`](../../../../apps/webapp/db/drizzle-migrations/0034_clinical_tests_b2_scoring_measure_kinds.sql): валидный объект с `schema_type` + массив `measure_items` → копия в `scoring`; иначе `qualitative` + текст в `raw_text`; **`scoring_config` не очищается** |
| Оговорка backfill vs app | B2 | **ACCEPTED** | В SQL legacy-текст: `scoring_config::text`; в TS `JSON.stringify(..., 2)` — расхождение только форматирования для уже мигрированных строк; функционально эквивалентно для чтения человеком. Менять исторические данные не требуется. |
| Форма всех `schema_type` | B2 | **PASS** | [`ClinicalTestForm.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx): `Select` numeric / likert / binary / qualitative; ветки полей (min/max/step, likert min/max, binary labels); общий блок измерений + `raw_text` |
| Q2: qualitative только каталог | PRE_IMPLEMENTATION | **PASS** | В схеме Zod есть `qualitative`; отдельного инстансного UX нет (вне B2) |
| `CreatableComboboxInput` + create errors | B2.5 | **PASS** | [`CreatableComboboxInput.tsx`](../../../../apps/webapp/src/shared/ui/CreatableComboboxInput.tsx): `tryCreate` → `setErr`; тест [`CreatableComboboxInput.test.tsx`](../../../../apps/webapp/src/shared/ui/CreatableComboboxInput.test.tsx) |
| Ошибка / пустой ответ GET measure-kinds | B2.5 | **PASS** (после FIX) | [`ClinicalTestMeasureRowsEditor.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx): `loadError` + «Повторить»; тест [`ClinicalTestMeasureRowsEditor.test.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.test.tsx) |
| API `measure_kinds` | ТЗ §3 | **PASS** | [`measure-kinds/route.ts`](../../../../apps/webapp/src/app/api/doctor/measure-kinds/route.ts); сервис и репозитории |
| Фильтры `region` + `assessmentKind` | B2 | **PASS** | [`page.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/page.tsx); [`pgClinicalTests.ts`](../../../../apps/webapp/src/infra/repos/pgClinicalTests.ts); [`ClinicalTestsPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx) |
| REST list `GET /api/doctor/clinical-tests` + фильтры | M2 FIX | **PASS** | [`clinical-tests/route.ts`](../../../../apps/webapp/src/app/api/doctor/clinical-tests/route.ts) query `region`, `assessment` + `400 invalid_query`; [`api.md`](../../../../apps/webapp/src/app/api/api.md) |
| Невалидный `?assessment=` в URL (каталог) | §10 low | **PASS** (после FIX) | `invalidAssessmentQuery` + баннер в [`ClinicalTestsPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx) |

## 3. Changed Files (ревью-ориентир)

| Область | Файлы | Risk |
|---------|-------|------|
| Схема / миграция | `db/schema/clinicalTests.ts`, `relations.ts`, `0034_*.sql`, `_journal.json` | low при применённом migrate |
| Домен scoring | `clinicalTestScoring.ts`, `clinicalTestAssessmentKind.ts` | low |
| Measure kinds | `measureKindsPorts.ts`, `measureKindsService.ts`, `measureKindCode.ts`, `pg*MeasureKinds.ts`, `inMemory*MeasureKinds.ts` | low |
| Tests module / repos | `types.ts`, `service.ts`, `pgClinicalTests.ts`, `inMemoryClinicalTests.ts` | medium (валидация на write) |
| API | `api/doctor/measure-kinds/route.ts`, `api/doctor/clinical-tests/route.ts`, `api.md` | low |
| UI | `CreatableComboboxInput.tsx`, `*.test.tsx`, `ClinicalTestMeasureRowsEditor.tsx`, `ClinicalTestForm.tsx`, `ClinicalTestsPageClient.tsx` | low |
| Actions / pages | `actionsShared.ts`, `actionsInline.ts`, `page.tsx` | low |

## 4. Architecture Rules Check

- [x] `modules/*` без прямых `@/infra/db/*` / `@/infra/repos/*` в новых файлах B2.
- [x] `measure-kinds/route.ts`: session → `buildAppDeps()` → сервис → JSON.
- [x] Новые таблицы/колонки через Drizzle + SQL миграция.
- [x] Порты measure kinds в `modules/tests`, реализации в `infra/repos`.
- [x] Интеграционные env для B2 не добавлялись.

## 5. UI Contract Check (doctor)

- [x] Примитивы shadcn + `ReferenceSelect` для региона; `CreatableComboboxInput` — по плану B2.5.
- [x] B6-поля не затрагивались.

## 6. Patient-facing

- [x] Не затрагивался (Q2 — каталог only).

## 7. Data Migration / Backfill

| Migration | Reversible? | Backfill? | Notes |
|-----------|-------------|-------------|--------|
| `0034_clinical_tests_b2_scoring_measure_kinds` | Частично (DROP колонок / таблицы) | Да | `UPDATE ... WHERE scoring IS NULL` после `ADD COLUMN`; идемпотентность на повторном прогоне ограничена условием (новые строки с non-null `scoring` не перезаписываются) |

## 8. Test Evidence

```bash
cd apps/webapp
pnpm exec vitest run \
  src/modules/tests/clinicalTestScoring.test.ts \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.test.tsx \
  src/shared/ui/CreatableComboboxInput.test.tsx
pnpm exec tsc --noEmit
```

После FIX 2026-05-03:

- **vitest** (команда выше): **PASS** (10 tests).
- **tsc** `--noEmit`: **PASS**.
- **eslint** (целевой набор — см. `LOG.md` § B2 FIX): **PASS**.

**Оставшиеся пробелы:** нет e2e на все `schema_type`; `ClinicalTestForm.test.tsx` по-прежнему мокает `ClinicalTestMeasureRowsEditor`.

## 9. Manual Smoke

- [ ] Doctor: `/app/doctor/clinical-tests` — каждый `schema_type`, сохранение, повторное открытие.
- [ ] Создание нового вида измерения через combobox; ошибка 422 / сеть.
- [ ] Фильтры регион + вид оценки + preserve в редиректах после save.
- [ ] Строка с legacy-only `scoring_config` (до migrate) или после migrate — отображение `raw_text` / scoring.

## 10. Regressions / Findings

### High

- None.

### Medium

- None (закрыто FIX 2026-05-03 — см. §13).

### Low

- None, за исключением приемлемого **ACCEPTED** в §2 (формат legacy-текста SQL vs TS).

## 11. Deferred Work

- Manual smoke §9 (периодически).
- Опционально: e2e на переключение всех `schema_type`.

## 12. Final DoD (этап B2)

- [x] Drizzle + backfill + доменный контракт scoring.
- [x] Форма + фильтры каталога + API measure-kinds.
- [x] `LOG.md` обновлён (EXEC + FIX B2).
- [x] Коммиты за EXEC и FIX.
- [x] `api.md` — B2 + measure-kinds + list query `region`/`assessment`.
- [x] `AUDIT_STAGE_B2.md` — PASS после FIX; residual снят.

---

## 13. FIX 2026-05-03 (закрытие AUDIT_STAGE_B2)

| ID | Действие | Файлы |
|----|----------|--------|
| M1 | Ошибка загрузки `GET measure-kinds`: `loadError`, кнопка «Повторить», разбор `!res.ok` / не-JSON | `ClinicalTestMeasureRowsEditor.tsx`, `ClinicalTestMeasureRowsEditor.test.tsx` |
| M2 | Паритет list API: query `region`, `assessment` + `400 invalid_query` | `clinical-tests/route.ts`, `api.md` |
| M3 | Vitest: `onCreate` → сообщение под полем | `CreatableComboboxInput.test.tsx` |
| low | Баннер при невалидном `?assessment=` на странице каталога | `page.tsx`, `ClinicalTestsPageClient.tsx` |

---

## MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03)**

Все пункты M1–M3 и связанный low из §10 закрыты в §13; критических/средних открытых finding **нет**.

_Конец AUDIT_STAGE_B2._
