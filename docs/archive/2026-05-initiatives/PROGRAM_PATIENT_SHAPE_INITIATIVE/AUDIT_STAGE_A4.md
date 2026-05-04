# AUDIT — Stage A4 (PROGRAM_PATIENT_SHAPE)

**Дата:** 2026-05-03  
**Scope:** Stage A4 — таблица `program_action_log`, чек-лист пациента (UTC-сутки), пост-сессия ЛФК (difficulty + `note`), маркер отправки теста, inbox врача «К проверке».  
**Источники:** [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.5, O2/O3).

---

## 1. Verdict

- **Status:** **PASS** по четырём проверкам запроса (§2–§5), с **Info** по использованию `action_type` **`viewed`** / **`note`** как отдельных значений enum (см. §6).
- **Summary:** Схема и CHECK допускают `done` \| `viewed` \| `note`; в текущем коде A4 в лог пишется преимущественно **`done`** (чек-лист, маркер теста, ЛФК-постсессия). Колонка **`note`** используется для текста пост-сессии ЛФК при **`action_type: done`** и O3 (без `lfk_session.note` в БД). Чек-лист строится из `getInstanceForPatient` + `omitDisabled…` и `isProgramChecklistItem` (без disabled/persistent/`test_set`). Inbox врача заполняется только из **`listPendingEvaluationResultsForPatient`** с **`decided_by IS NULL`** и **`instance.status = 'active'`**.

---

## 1b. Post-FIX (аудит → код / документ)

| ID | Результат |
|---|---|
| **Critical / Major** | **N/A:** в первичном аудите (§2–§6) **не** заводились отдельные Critical/Major — вердикт **PASS** без блокирующих дефектов. |
| **A4-LOG-TYPES-01** | **Defer (product):** отдельные строки лога с `action_type: "viewed"` или **`note`** не требуются для закрытия A4/O3; при A5 «mark viewed» / заметки без `done` — реализовать запись + тесты + `api.md` (см. §7 MANDATORY FIX). |
| **A4-UTC-01** | **Defer (product):** сутки чек-листа остаются **UTC** до отдельного решения про IANA-таймзону из `system_settings` и согласованного пересчёта окон. |
| **Контур run-screen / чек-лист** | **Подтверждено (POST-FIX):** экран прохождения и чек-лист/ЛФК UI только в **`apps/webapp/src/app/app/patient/treatment-programs/`** (`[instanceId]/page.tsx` → `PatientTreatmentProgramDetailClient`); вызовы A4 API — только **`/api/patient/treatment-program-instances/...`** (`rg` по `apps/webapp`: совпадения вне этого контура — только **`api.md`**). |

---

## 2. `program_action_log`: `done` / `viewed` / `note`

| Критерий | Статус | Доказательство |
|---|---|---|
| Схема и допустимые `action_type` | **PASS** | `apps/webapp/db/drizzle-migrations/0030_program_action_log.sql` + `apps/webapp/db/schema/programActionLog.ts` — CHECK `action_type = ANY (ARRAY['done','viewed','note'])`; колонки `instance_id`, `instance_stage_item_id`, `patient_user_id`, `session_id`, `payload`, `note`, `created_at`. |
| **`done` — чек-лист** | **PASS** | `patient-program-actions.ts` `patientToggleChecklistItem` → `insertAction({ actionType: "done", payload: null, note: null, … })` при первой отметке за UTC-день. |
| **`done` — маркер теста** | **PASS** | `progress-service.ts` после `upsertResult` — `insertAction({ actionType: "done", payload: { source: "test_submitted", testResultId }, note: null })`; детали результата остаются в `test_results`. |
| **`done` — ЛФК пост-сессия** | **PASS** | `patient-program-actions.ts` `patientSubmitLfkPostSession` — `insertAction({ actionType: "done", payload: { difficulty, source: "lfk_session" }, note: noteTrim, sessionId })`. |
| **`viewed` / `action_type: note`** | **Info** | В сервисных путях A4 **нет** записей с `action_type: "viewed"` или **`note`** как отдельным типом действия; продуктовый §1.5 допускает их как расширение. Текущая реализация O3 закрыта через **`done` + колонка `note`**. |

---

## 3. Checklist: исключение `disabled` и persistent

| Критерий | Статус | Доказательство |
|---|---|---|
| `disabled` не в данных чек-листа | **PASS** | RSC `patient/treatment-programs/[instanceId]/page.tsx` — `omitDisabledInstanceStageItemsForPatientApi(rawDetail)` перед передачей в `PatientTreatmentProgramDetailClient`; чек-лист строится из того же `detail`. |
| Persistent recommendation | **PASS** | `patient-program-actions.ts` `isProgramChecklistItem` — `isPersistentRecommendation(item)` → `false`; дополнительно `recommendation` с `isActionable === false` отфильтрованы. |
| `test_set` вне чек-листа | **PASS** | `isProgramChecklistItem` — `itemType === "test_set"` → `false`; сценарий тестов — отдельный UI/API. |
| Стадии чек-листа | **PASS** | `pickStagesForPatientChecklist` — этап 0 при `status !== skipped`; прочие только `available` \| `in_progress`; при `detail.status !== "active"` список пустой. |
| Тест | **PASS** | `patient-program-actions.test.ts` — «excludes persistent and disabled». |

---

## 4. Post-session ЛФК: `difficulty` + опциональная `note` в `program_action_log`

| Критерий | Статус | Доказательство |
|---|---|---|
| **O2** (уровень комплекса) | **PASS** | Одна вставка на сохранение формы по `instance_stage_item_id` типа `lfk_complex`; `payload` содержит `difficulty` и `source: "lfk_session"`; перед вставкой `deleteAllDoneInWindow` за UTC-день для идемпотентности/перезаписи. |
| **O3** (заметка в логе, не в `lfk_session`) | **PASS** | `note` передаётся в `insertAction` → колонка `program_action_log.note`; отдельной таблицы/поля `lfk_session.note` в A4 нет. |
| API и валидация | **PASS** | `POST .../progress/lfk-session` + Zod `difficulty` enum `easy\|medium\|hard`, `note` опционально; `lfk-session/route.ts` → `patientSubmitLfkPostSession`. |
| Без шкалы боли | **PASS** | Тело и UI не содержат поля боли (см. `PatientTreatmentProgramDetailClient.tsx` блок ЛФК). |

---

## 5. Doctor inbox: pending (`decided_by IS NULL`), скрытие решённых

| Критерий | Статус | Доказательство |
|---|---|---|
| Запрос только pending | **PASS** | `pgTreatmentProgramTestAttempts.ts` `listPendingEvaluationResultsForPatient` — `where(and(eq(instanceTable.patientUserId, …), eq(instanceTable.status, "active"), isNull(resultTable.decidedBy)))`. |
| In-memory паритет | **PASS** | `inMemoryTreatmentProgramInstance.ts` — тот же смысл: `r.decidedBy` пропуск, `inst.status === "active"`, `att.patientUserId`. |
| UI только из списка pending | **PASS** | `ClientProfileCard.tsx` — секция «Тесты, ожидающие оценки» рендерит `pendingProgramTestEvaluations.map`; пустое состояние при длине 0. Источник данных: `treatmentProgramProgress.listPendingTestEvaluationsForPatient` в `clients/[userId]/page.tsx` и `clients/page.tsx`. |
| Решённые не в inbox | **PASS** | После `overrideResultDecision` / PATCH врача с `decided_by` строка не попадает в выборку `isNull(decidedBy)`; в списке карточки пациента не отображаются. |

**Info:** полная история результатов по экземпляру по-прежнему на экране экземпляра программы врача (`GET .../test-results`); inbox — только «ожидают оценки».

---

## 6. Замечания (product / backlog)

| ID | Уровень | Статус после FIX | Описание |
|---|---|---|---|
| **A4-LOG-TYPES-01** | Info | **Defer** (см. §1b) | Не используются **`viewed`** и **`action_type: note`** как отдельные строки лога; при появлении A5 «mark viewed» / отдельных заметок без `done` — добавить запись + тесты + `api.md`. |
| **A4-UTC-01** | Info | **Defer** (см. §1b) | Граница «день» чек-листа — **UTC** (`utcDayWindowIso`); продукт может позже потребовать IANA-таймзону из `system_settings` (см. архитектурные правила). |

---

## 7. MANDATORY FIX INSTRUCTIONS

Любой **FIX** по замечаниям A4, регрессиям или расширению лога — выполнять **только** с соблюдением правил ниже.

### 7.1 Схема и миграции

1. Новые значения **`action_type`** — только через изменение CHECK в миграции + `programActionLog.ts` + согласование с `PROGRAM_ACTION_TYPES` в `types.ts`.
2. Не хранить «полный» `raw_value` теста в `program_action_log.payload`; детали — только в `test_results` / `test_attempts`.
3. Каскады: FK на `treatment_program_instances` и `treatment_program_instance_stage_items` **ON DELETE CASCADE** — сохранять при любых правках.

### 7.2 Семантика записей

4. **Маркер теста** писать только из **`createTreatmentProgramProgressService` → `patientSubmitTestResult`** (или преемника), с **`payload.source: "test_submitted"`** и **`testResultId`**; не дублировать вставку в `route.ts`.
5. **ЛФК пост-сессия:** одна логическая запись за сабмит формы на комплекс (**O2**); **`note`** только в колонке **`program_action_log.note`** (**O3**); не вводить `lfk_session.note` без отдельного продукта и миграции.
6. **Чек-лист `done`:** идемпотентность «не спамить дублями за день» — через существующий паттерн (`listDoneItemIdsInWindow` / `deleteSimpleDoneInWindow`); не ослаблять без продуктового решения.

### 7.3 Read-model пациента

7. Чек-лист и любые patient-мутации по элементам **обязаны** опираться на дерево после **`omitDisabledInstanceStageItemsForPatientApi`** там, где read model пациента зафиксирован (RSC + patient `GET`); не смешивать с полным деревом для прогресса без явного разделения в коде.

### 7.4 Inbox врача

8. **`listPendingEvaluationResultsForPatient`** обязан сохранять фильтры **`decided_by IS NULL`** и **`instance.status = 'active'`**; при изменении — обновить **`ClientProfileCard`** / страницы клиентов и тесты PG + in-memory.
9. Не подмешивать в этот список кросс-пациентский «Сегодня» (out of scope A4).

### 7.5 API и документация

10. Любое новое поле/маршрут patient `program_action_log` / checklist / lfk-session — обновить **`apps/webapp/src/app/api/api.md`**.
11. **`buildAppDeps`:** не вызывать из `modules/*`; новые порты — `ports.ts` + infra repo + wiring только в `buildAppDeps`.

### 7.6 Контур файлов для FIX A4

12. Типичная зона: `apps/webapp/db/schema/programActionLog.ts`, `apps/webapp/db/drizzle-migrations/**`, `apps/webapp/src/modules/treatment-program/patient-program-actions.ts`, `progress-service.ts`, `ports.ts`, `types.ts`, `pgProgramActionLog.ts`, `inMemoryProgramActionLog.ts`, `pgTreatmentProgramTestAttempts.ts`, `inMemoryTreatmentProgramInstance.ts`, `buildAppDeps.ts`, `apps/webapp/src/app/api/patient/treatment-program-instances/**`, `apps/webapp/src/app/app/patient/treatment-programs/**`, `apps/webapp/src/app/app/doctor/clients/**`, соответствующие тесты.

---

## 8. Повторяемые проверки (smoke)

```bash
rg "program_action_log|insertAction|listPendingEvaluationResultsForPatient|isProgramChecklistItem|patientSubmitLfkPostSession|test_submitted|lfk_session" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/patient-program-actions.test.ts src/modules/treatment-program/progress-service.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

---

## 9. Ключевые ссылки на код

| Тема | Путь |
|---|---|
| Схема | `apps/webapp/db/schema/programActionLog.ts` |
| Миграция | `apps/webapp/db/drizzle-migrations/0030_program_action_log.sql` |
| Чек-лист + ЛФК | `apps/webapp/src/modules/treatment-program/patient-program-actions.ts` |
| Маркер теста | `apps/webapp/src/modules/treatment-program/progress-service.ts` |
| Pending inbox PG | `apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts` |
| Patient UI | `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` |
| Doctor inbox UI | `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` |
