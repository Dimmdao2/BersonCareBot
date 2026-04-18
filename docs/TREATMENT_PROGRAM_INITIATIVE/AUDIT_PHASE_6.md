# AUDIT — Фаза 6 (повторный аудит + FIX closure)

**Дата повторного аудита:** 2026-04-18.  
**Дата FIX closure:** 2026-04-18.  
**Эталон:** `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md` **§ 3** (статусы `instance_stage`, переходы, пропуск с причиной).  
**Scope проверки (код и схема фазы 6):**  
`apps/webapp/db/schema/treatmentProgramTestAttempts.ts`, экспорт в `db/schema/index.ts`, миграция `db/drizzle-migrations/0005_treatment_program_phase6.sql`;  
`db/schema/treatmentProgramInstances.ts` (CHECK статусов этапа, `skip_reason`);  
`src/modules/treatment-program/progress-service.ts`, `progress-scoring.ts`, `types.ts`, `event-recording.ts`;  
`infra/repos/pgTreatmentProgramInstance.ts`, `pgTreatmentProgramTestAttempts.ts`, `inMemoryTreatmentProgramInstance.ts`;  
API `app/api/**/treatment-program-instances/**`;  
UI пациента `app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`;  
UI врача `app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx`;  
тесты `modules/treatment-program/progress-service.test.ts`.  

**Вне scope:** полный прогон CI репозитория, файлы других фаз (кроме пересечений по вызовам).

---

## 1) Таблицы `test_attempts` и `test_results` через Drizzle schema

### Verdict: **PASS**

| Требование | Реализация |
|------------|------------|
| Определение в Drizzle | `pgTable("test_attempts")` / `pgTable("test_results")` в `treatmentProgramTestAttempts.ts` |
| Экспорт схемы | `export * from "./treatmentProgramTestAttempts"` в `db/schema/index.ts` |
| Миграция | `0005_treatment_program_phase6.sql` согласована с индексами и FK |
| FK на тест | `test_id` → таблица БД `tests` (Drizzle: `clinicalTests` в `clinicalTests.ts`, `pgTable("tests")`) |
| Одна открытая попытка | `uniqueIndex` … `WHERE completed_at IS NULL` на `(instance_stage_item_id, patient_user_id)` |
| Уникальность результата | `idx_test_results_attempt_test` на `(attempt_id, test_id)` |
| CHECK `normalized_decision` | `passed` \| `failed` \| `partial` в Drizzle и в SQL миграции |

---

## 2) Статусы этапов и переходы (сверка с § 3)

### Verdict: **PASS** для описанных в § 3 сценариев

| Переход § 3 | Реализация |
|-------------|------------|
| `locked → available` после `completed` / `skipped` предыдущего | `updateInstanceStage` в PG: следующий этап с `status = locked` и минимальным `sort_order` &gt; текущего → `available` (транзакция). In-memory: `unlockNextLockedStage`. |
| `locked → available` вручную врачом | `doctorSetStageStatus` → `updateInstanceStage` с `available`. |
| `available → in_progress` при первом действии пациента | `patientTouchStageItemInner`: если этап `available`, обновление в `in_progress` + событие при наличии порта событий. |
| `in_progress → completed` при всех элементах с `completed_at` | `maybeCompleteStageFromItems` → `status: completed`. |
| `in_progress → completed` вручную врачом | `doctorSetStageStatus` с `completed` (полнота элементов не проверяется — соответствует § 3 «или вручную врачом»). |
| `→ skipped` только вручную + обязательный `reason` | Сервис: пустой `reason` после trim → ошибка; `skip_reason` на этапе; `normalizeEventReason` для `stage_skipped`. |
| CHECK в БД | `treatment_program_instance_stages_status_check`: `locked` \| `available` \| `in_progress` \| `completed` \| `skipped` |

**Политика широкого override (без полной FSM):** зафиксирована в `apps/webapp/src/app/api/api.md` (маршрут doctor `.../stages/[stageId]`). Сервис **`doctorSetStageStatus`** не отклоняет «неожиданные» пары `(текущий → новый)`; ужесточение — отдельная задача.

---

## 3) Автопереход: `completed` / `skipped` текущего → `available` следующего

### Verdict: **PASS**

| Проверка | Результат |
|----------|-----------|
| Выбор «следующего» этапа | Один кандидат: `locked`, `sort_order` &gt; текущего, `ORDER BY sort_order, id LIMIT 1`. |
| Транзакция (PG) | Обновление текущего этапа и разблокировка в одной `db.transaction`. |
| In-memory | Та же семантика при `completed` / `skipped`. |
| Тест | `progress-service.test.ts`: «skipped current stage unlocks next locked as available (§3)»; сценарий `test_set` закрывает этап 1 и открывает этап 2. |

---

## 4) Ручной override врача; для `skip` обязателен `reason`

### Verdict: **PASS**

| Сценарий | Реализация |
|----------|------------|
| Открыть этап | `status: available` с UI «Открыть этап». |
| Завершить этап | `status: completed`. |
| Пропуск с причиной | `doctorSetStageStatus`: `skipped` без непустого `reason` → ошибка; UI: textarea + `patch({ status: "skipped", reason: … })`. |
| Пропуск без причины | Ожидаемая ошибка сервиса; тест `doctor skip requires reason`. |
| Override итога теста | `doctorOverrideTestResult` → `overrideResultDecision` с `decided_by` = врач; проверка принадлежности результата экземпляру через `listResultDetailsForInstance`. |

---

## 5) `test_results`: `raw_value`, `normalized_decision`, `decided_by`

### Verdict: **PASS**

| Поле | Реализация |
|------|------------|
| `raw_value` | JSONB NOT NULL; `upsertResult` пишет `rawValue` из тела запроса пациента. |
| `normalized_decision` | NOT NULL + CHECK; пациент — скоринг / явное поле / fallback; врач — `overrideResultDecision` обновляет только решение (и `decided_by`). |
| `decided_by` | `null` при автоматическом сохранении пациентом (`patientSubmitTestResult`); UUID врача при override (тест `doctorOverrideTestResult sets decidedBy`). |

**Отображение после override:** в UI врача и пациента при `decided_by != null` показывается метка «переопределено врачом» / «итог уточнён врачом»; итог выводится через `formatNormalizedTestDecisionRu` (русские подписи).

---

## 6) Patient / Doctor UI и статусная модель

### Verdict: **PASS** (после FIX)

| Критерий | Пациент | Врач |
|----------|---------|------|
| Статус этапа | `formatTreatmentProgramStageStatusRu` | Тот же хелпер |
| Результаты тестов | **`GET`** `/api/patient/.../test-results` + блок «Ваши результаты тестов» (read-only, те же поля, что у врача) | Секция «Результаты тестов» + override-кнопки |
| Итог теста | `formatNormalizedTestDecisionRu` | То же + дубль enum в скобках для отладки |

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 3 (итог)

| Пункт § 3 | Статус |
|-----------|--------|
| Диаграмма `locked` → `available` → `in_progress` → `completed` и ветка `skipped` | OK |
| Авто `locked → available` после предыдущего `completed` / `skipped` | OK |
| Ручное открытие врачом | OK |
| `available → in_progress` при первом действии пациента | OK |
| Завершение по элементам или вручную врачом | OK |
| `skipped` только вручную + обязательный `reason` | OK |

---

## Gate (фаза 6, после FIX)

| Критерий | Статус |
|----------|--------|
| Drizzle + миграция `0005_*` | OK |
| Переходы и разблокировка следующего этапа | OK |
| Skip + reason | OK |
| `test_results` поля и ограничения | OK |
| API + UI patient test-results | OK (FIX) |
| Сервисные тесты прогресса (в scope) | OK |
| Миграции на стендах | Операционно (вне этого аудита) |

---

## MANDATORY FIX INSTRUCTIONS — статус закрытия (2026-04-18)

### Critical / Major

| Пункт | Статус |
|-------|--------|
| Отклонения от § 3 и Drizzle-контракта **на момент аудита** | **Не выявлены** — **N/A**, формально закрыто. |
| Регресс при изменениях `progress-service` / `updateInstanceStage` / test attempts schema | Перезапуск чек-листа § 1–6 и `progress-service.test.ts` — **процедурное требование** к будущим PR. |

### Minor

| # | Описание | Результат |
|---|----------|-----------|
| 1 | FSM vs документация для `PATCH` статуса этапа | **Закрыто документацией:** явная политика «без полной FSM» в `api.md` (уточнённая формулировка FIX). Матрица `(from → to)` — **defer** кода до отдельного продукта. |
| 2 | Паритет отображения результатов тестов (пациент / врач) | **Закрыто кодом:** `GET /api/patient/treatment-program-instances/[instanceId]/test-results`, SSR `initialTestResults` + клиентский refresh; блок «Ваши результаты тестов». |
| 3 | Подпись после override врача (`decided_by`) | **Закрыто кодом:** бейдж в doctor/patient UI; `formatNormalizedTestDecisionRu` для единых подписей. |

### Informational (defer без изменений)

| # | Тема |
|---|------|
| 4 | § 3 «все обязательные элементы» — флаг обязательности в будущем |
| 5 | Пустой `tests[]` в snapshot — валидация при назначении |
| 6 | Дубликаты `sort_order` у этапов — детерминизм по `id` |

---

## AUDIT_PHASE_6 FIX — верификация (команды)

Выполнено в рамках FIX (без полного `pnpm run ci` по репозиторию):

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts` — см. `LOG.md`.
- `pnpm --dir apps/webapp run typecheck` — см. `LOG.md`.
- `pnpm --dir apps/webapp run lint` — см. `LOG.md`.
- `pnpm run build:webapp` — pre-deploy сборка webapp — см. `LOG.md`.
- `pnpm run audit` — известные уязвимости dev/transitive (класс репозитория), не блокер FIX фазы 6 — см. `LOG.md`.

---

## История (справочно)

Первичный и повторный аудит зафиксированы выше; FIX 2026-04-18 закрывает minor #1–#3 и обновляет gate **PASS**.
