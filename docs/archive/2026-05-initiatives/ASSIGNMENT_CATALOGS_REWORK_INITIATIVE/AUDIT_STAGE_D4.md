# AUDIT_STAGE_D4 — ASSIGNMENT_CATALOGS_REWORK (defer closure)

**Дата аудита:** 2026-05-04  
**Последний FIX:** 2026-05-04 (`AUDIT_STAGE_D4` MANDATORY closure — FIX-D4-L1, M-D4-L2)  
**Источник требований:** [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md), [`PROMPTS_DEFER_CLOSURE_STAGES.md`](PROMPTS_DEFER_CLOSURE_STAGES.md) (блок D4 — AUDIT)  
**Scope:** Stage D4 — Q2: инстансное прохождение `qualitative` в `test_set` и этапный прогресс (тот же контур, что у остальных типов результатов).

---

## 1. Verdict

| Критерий | Статус |
|----------|--------|
| **Итог** | **PASS** (после FIX 2026-05-04) |
| **Общий pipeline для qualitative** | **PASS** (§2) |
| **Decision + completion → прогресс этапа** | **PASS** (§3) |
| **Доки и тесты** | **PASS** (§4–5) |

**Краткое резюме:** `patientSubmitTestResult` остаётся единым handler’ом. **FIX-D4-L1:** при `scoringConfig.schema_type === "qualitative"` запасной итог **`partial`** только из числового `raw_value.score` **не** применяется без явного **`normalizedDecision`** — см. [`scoringConfigIsQualitative`](../../../../apps/webapp/src/modules/treatment-program/progress-scoring.ts). **M-D4-L2:** в [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md) §3 добавлена ссылка на [`api.md`](../../../../apps/webapp/src/app/api/api.md). Тесты и `api.md` обновлены.

---

## 2. Qualitative использует общий pipeline

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| Один handler для всех результатов набора | **PASS** | [`progress-service.ts`](../../../../apps/webapp/src/modules/treatment-program/progress-service.ts) — `patientSubmitTestResult` |
| Источник `scoringConfig` | **PASS** | `scoringConfigForTestInSnapshot` |
| Различие только в данных / правилах вывода итога | **PASS** | [`progress-scoring.ts`](../../../../apps/webapp/src/modules/treatment-program/progress-scoring.ts) — `inferNormalizedDecisionFromScoring`, `scoringAllowsNumericDecisionInference`, `scoringConfigIsQualitative` |
| UI | **PASS** | [`PatientTreatmentProgramDetailClient.tsx`](../../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) — `TestSetBlock` |
| Маршрут API | **PASS** | [`test-result/route.ts`](../../../../apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/test-result/route.ts) |

**Закрыто FIX-D4-L1:** сценарий «только `score` при qualitative» больше не приводит к молчаливому `partial` — сервер требует явный итог (тот же текст ошибки, что при полном отсутствии решения).

---

## 3. Decision и completion корректно отражаются в прогрессе этапа

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| Сохранение итога, события, завершение набора и этапа | **PASS** | `upsertResult` → `test_completed` → при `allDone` — `completeAttempt`, `setStageItemCompletedAt`, `maybeCompleteStageFromItems` в [`progress-service.ts`](../../../../apps/webapp/src/modules/treatment-program/progress-service.ts) |
| Регрессия числовых порогов | **PASS** | `test_results: scoring passIfGte and stage completion after all tests` |
| Qualitative | **PASS** | Тесты `D4/Q2: ...` + `FIX-D4-L1: qualitative scoring with only numeric score...` в [`progress-service.test.ts`](../../../../apps/webapp/src/modules/treatment-program/progress-service.test.ts) |

---

## 4. Документация

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| `api.md` и Q2 / FIX-L1 | **PASS** | [`api.md`](../../../../apps/webapp/src/app/api/api.md) — **patient/.../progress/test-result** |
| План этапа §3 → api | **PASS** | [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md) |
| Лог инициативы | **PASS** | [`LOG.md`](LOG.md) — запись FIX D4 |

---

## 5. Тесты

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| Vitest D4 + L1 | **PASS** | `progress-service.test.ts`, `testSetSnapshotView.test.ts` |
| `scoringConfigIsQualitative` | **PASS** | describe `progress-scoring` в `progress-service.test.ts` |

```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts
```

---

## 6. Findings

### High / Medium

- Не выявлено.

### Low

- ~~**M-D4-L1**~~ — **закрыто** (FIX-D4-L1, см. §10).
- ~~**M-D4-L2**~~ — **закрыто** (ссылка в `STAGE_D4_PLAN.md` §3).

---

## 7. MANDATORY FIX INSTRUCTIONS

**Открытых инструкций нет** после FIX 2026-05-04 (см. §10). Новые находки — новый проход AUDIT.

### Critical

- **Нет.**

### Major

- **Нет.**

### Minor

| ID | Действие | Статус |
|----|----------|--------|
| **M-D4-L1** | Запрет fallback `partial` только от `score` при `schema_type: qualitative` | **closed** (FIX-D4-L1) |
| **M-D4-L2** | Строка в `STAGE_D4_PLAN.md` §3 → `api.md` | **closed** |

---

## 8. FIX closure log

| Дата | ID | Что сделано |
|------|-----|-------------|
| 2026-05-04 | **FIX-D4-L1** | [`scoringConfigIsQualitative`](../../../../apps/webapp/src/modules/treatment-program/progress-scoring.ts); в [`progress-service.ts`](../../../../apps/webapp/src/modules/treatment-program/progress-service.ts) fallback `partial` по `score` не применяется при qualitative; тест `FIX-D4-L1: qualitative scoring with only numeric score...`; уточнён [`api.md`](../../../../apps/webapp/src/app/api/api.md). |
| 2026-05-04 | **M-D4-L2** | [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md) §3 — явная ссылка на `api.md` (test-result). |

---

## 9. Final DoD (STAGE_D4 §6)

- [x] Для `qualitative` нет отдельного продуктового режима прогресса — общий pipeline.
- [x] Тесты и `api.md` подтверждают поведение.
- [x] MANDATORY FIX INSTRUCTIONS закрыты (§7).
