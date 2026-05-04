# AUDIT_STAGE_D4 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-04  
**Scope:** Stage D4 (Q2: инстансное прохождение `qualitative` и этапный прогресс)  
**Source plan:** [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md), [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md)

## 1. Verdict

- **Status:** **PASS**
- **Summary:** `patientSubmitTestResult` использует один контур для всех типов снимка: `normalizedDecision` из тела **или** вывод из числовых порогов в `scoringConfig` (`inferNormalizedDecisionFromScoring`); при невозможности вывода — явный **`normalizedDecision`** обязателен. Завершение элемента `test_set` и этапа — через существующие `setStageItemCompletedAt` и `maybeCompleteStageFromItems` без отдельной ветки `qualitative`. Пациентский UI различает только **источник ввода** (score vs выбор итога) по признаку наличия числовых порогов (`scoringAllowsNumericDecisionInference`), не по отдельному «режиму прогресса».

## 2. Критерии плана

| Критерий | Status | Evidence |
|----------|--------|----------|
| Общий pipeline прогресса | **PASS** | [`progress-service.ts`](../../apps/webapp/src/modules/treatment-program/progress-service.ts) `patientSubmitTestResult`, `maybeCompleteStageFromItems` |
| Явный итог для qualitative / без порогов | **PASS** | Тот же handler; ошибка при отсутствии решения; тесты D4 в [`progress-service.test.ts`](../../apps/webapp/src/modules/treatment-program/progress-service.test.ts) |
| UI передаёт `normalizedDecision` когда авто-score невозможен | **PASS** | [`PatientTreatmentProgramDetailClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) `TestSetBlock` |
| API-контракт задокументирован | **PASS** | [`api.md`](../../apps/webapp/src/app/api/api.md) — `patient/.../progress/test-result` |

## 3. Findings

### High / Medium

- Не выявлено.

### Low

- Локальная валидация «нужен итог» на клиенте дублирует серверное сообщение — приемлемо для UX.

## 4. Test Evidence

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts`
- `pnpm --dir apps/webapp exec eslint` на изменённых файлах
- `pnpm --dir apps/webapp exec tsc --noEmit`

## 5. Closure

Этап D4 закрыт: поведение Q2 зафиксировано тестами и `api.md`; отдельный продуктовый режим для `qualitative` не вводился.
