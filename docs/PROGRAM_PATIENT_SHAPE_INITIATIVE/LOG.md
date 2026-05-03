# LOG — PROGRAM_PATIENT_SHAPE_INITIATIVE

Формат: дата, этап (A1...A5), что сделано, проверки, решения, вне scope.

---

## 2026-05-03 — Stage A4 — `program_action_log`, чек-лист пациента, ЛФК post-session, inbox «К проверке»

**Контекст:** [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) (O2/O3 зафиксированы в коде и `api.md`).

**Сделано:**

- **Схема:** таблица **`program_action_log`** (`payload` jsonb, `note`, `session_id`, CHECK `action_type` ∈ done/viewed/note); миграция **`0030_program_action_log.sql`**; Drizzle `db/schema/programActionLog.ts`, экспорт в `db/schema/index.ts`, путь в `drizzle.config.ts`.
- **Порты/репозитории:** `ProgramActionLogPort` + PG `pgProgramActionLog.ts` + in-memory `inMemoryProgramActionLog.ts`; расширен `TreatmentProgramTestAttemptsPort` методом **`listPendingEvaluationResultsForPatient`** (PG + in-memory).
- **Сервисы:** `patient-program-actions.ts` — чек-лист (UTC-сутки), toggle без дубля `done` за день, ЛФК **`patientSubmitLfkPostSession`** (O2: одна запись на комплекс с `payload.source: "lfk_session"` + difficulty; O3: текст в **`note`**); `progress-service` — после **`upsertResult`** маркер `program_action_log` (`payload.source: "test_submitted"`); **`listPendingTestEvaluationsForPatient`** на progress-сервисе.
- **DI:** `buildAppDeps` — `programActionLogPort`, **`treatmentProgramPatientActions`**, `actionLog` в **`treatmentProgramProgressService`**.
- **API (patient):** `GET .../checklist-today`, `POST .../items/[itemId]/progress/checklist`, `POST .../items/[itemId]/progress/lfk-session`.
- **UI пациента:** `PatientTreatmentProgramDetailClient` — секция «Чек-лист на сегодня», checkbox по плану A4, форма «Как прошло занятие?» / «Заметка для врача» для `lfk_complex`.
- **UI врача:** `ClientProfileCard` — секция «Тесты, ожидающие оценки», бейдж **«К проверке»**, ссылка **«Открыть тест»**; данные с RSC `clients/[userId]/page.tsx` и `clients/page.tsx` (master-detail).
- **`api.md`**, чекбоксы **`STAGE_A4_PLAN.md`** §6.

**Проверки (целевые A4):**

```bash
rg "program_action_log|session_id|action_type|decided_by|К проверке|Как прошло занятие" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/patient-program-actions.test.ts src/modules/treatment-program/progress-service.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec eslint "src/modules/treatment-program/patient-program-actions.ts" "src/modules/treatment-program/patient-program-actions.test.ts" "src/modules/treatment-program/progress-service.ts" "src/modules/treatment-program/progress-service.test.ts" "src/modules/treatment-program/ports.ts" "src/infra/repos/pgProgramActionLog.ts" "src/infra/repos/inMemoryProgramActionLog.ts" "src/infra/repos/pgTreatmentProgramTestAttempts.ts" "src/infra/repos/inMemoryTreatmentProgramInstance.ts" "src/app-layer/di/buildAppDeps.ts" "src/app/api/patient/treatment-program-instances/[instanceId]/checklist-today/route.ts" "src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/checklist/route.ts" "src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/lfk-session/route.ts" "src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx" "src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx" "src/app/app/doctor/clients/ClientProfileCard.tsx" "src/app/app/doctor/clients/[userId]/page.tsx" "src/app/app/doctor/clients/page.tsx"
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** `rg` — ожидаемые вхождения; **vitest** (3 файла) — PASS; **eslint** (перечисленные файлы) — PASS; **`tsc --noEmit`** — PASS.

**Scope / вне scope:**

- In scope: treatment-program контур, patient/doctor UI и API в рамках плана A4; без Today-dashboard, без integrator, без courses.

**Намеренно не делали:**

- Полный **`pnpm run ci`** в этом прогоне не запускался.
- Тип **`viewed`** в логе зарезервирован схемой; отдельные вызовы записи в A4 не добавлялись.

**Первичный аудит:** [`AUDIT_STAGE_A4.md`](AUDIT_STAGE_A4.md) — см. ниже POST-AUDIT FIX.

---

## 2026-05-03 — Stage A4 — POST-AUDIT FIX (`AUDIT_STAGE_A4.md`)

**Сделано:** обновлён [`AUDIT_STAGE_A4.md`](AUDIT_STAGE_A4.md) — **§1b Post-FIX** (Critical/Major **N/A**; **A4-LOG-TYPES-01** / **A4-UTC-01** → **Defer** с обоснованием; подтверждение контура run-screen/чек-листа в `patient/treatment-programs/` + patient `treatment-program-instances` API); §6 — колонка «Статус после FIX».

**Critical / Major:** N/A.

**Проверки (целевые A4, без full `ci`):**

```bash
rg "program_action_log|insertAction|listPendingEvaluationResultsForPatient|isProgramChecklistItem|patientSubmitLfkPostSession|test_submitted|lfk_session" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/patient-program-actions.test.ts src/modules/treatment-program/progress-service.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** `rg` — ожидаемые вхождения; **vitest** (3 файла) — PASS; **`tsc --noEmit`** — PASS.

**Намеренно не делали:** полный **`pnpm run ci`**.

---

## 2026-05-03 — Stage A3 — POST-AUDIT FIX (`AUDIT_STAGE_A3.md`)

**Сделано:**

- **A3-ASSIGN-DEF (Low):** `assignTemplateToPatient` — `groupRows` из **`[...(st.groups ?? [])]`** в `instance-service.ts` (устойчивость к `undefined` у `groups` на этапе).

**Critical / Major:** в `AUDIT_STAGE_A3.md` §7 первичного прогона не заводились — вердикт PASS без блокирующих пунктов; **N/A**.

**Minor / Info:**

- **A3-ASSIGN-DEF:** закрыт кодом.
- **A3-UI-INST-01:** **defer (product)** — полноценный диалог редактирования текста instance-группы у врача; до отдельной задачи достаточно **`PATCH .../stage-groups/[groupId]`** (как в первичном A3 «намеренно не делали»).
- **Пустой этап у пациента (Info в аудите §5):** **defer (UX)** — вне scope этого FIX.

**Scope (подтверждение):** изменения только в **`apps/webapp/src/modules/treatment-program/instance-service.ts`**, **`docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A3.md`**, **`LOG.md`** — внутри treatment-program домена + initiative docs; без courses, без новых API/env, без DnD.

**Проверки (целевые A3, как в `AUDIT_STAGE_A3.md` §9 + контур DnD):**

```bash
rg "treatment_program_template_stage_groups|treatment_program_instance_stage_groups|group_id|templateGroupId|omitDisabledInstanceStageItemsForPatientApi" apps/webapp/src apps/webapp/db
rg "@dnd-kit|dnd-kit" apps/webapp/src/app/app/patient/treatment-programs apps/webapp/src/app/app/doctor/treatment-program-templates apps/webapp/src/app/app/doctor/clients/treatment-programs
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/stage-semantics.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** первый `rg` (A3-строки) — совпадения в `db/schema`, миграции `0029_*`, repos/modules как ожидается; второй `rg` DnD по трём путям treatment-program UI — **нет совпадений** (exit code 1 у `rg` = no matches); **vitest** — 2 файла, 11 тестов, PASS; **`tsc --noEmit`** — PASS.

**CI:** полный **`pnpm run ci`** не запускался (запрос пользователя).

---

## 2026-05-03 — Stage A3 — группы этапа (шаблон + экземпляр), copy map, UI врача/пациента

**Контекст:** [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md).

**Сделано:**

- **Схема:** `treatment_program_template_stage_groups`, `treatment_program_instance_stage_groups` (`source_group_id`), nullable `group_id` на элементах шаблона и экземпляра; миграция **`0029_treatment_program_a3_stage_groups.sql`**.
- **Домен:** типы `groups[]` на этапе, `groupId` на элементах; `TreatmentProgramInstanceStageInput` с опциональными **`groups?`** / **`templateGroupId?`**; `assignTemplateToPatient` копирует группы и маппит `group_id` у элементов.
- **Порты/репозитории:** PG + in-memory — CRUD/reorder групп, patch `group_id` у элементов; `omitDisabledInstanceStageItemsForPatientApi` убирает пустые группы у пациента после фильтра disabled.
- **API (doctor):** `POST .../templates/stages/[stageId]/groups`, `POST .../groups/reorder`, `PATCH|DELETE .../templates/stage-groups/[groupId]`; зеркально для инстанса + `groupId` в `PATCH` instance `stage-items` и в `POST` добавления элемента (шаблон и инстанс).
- **UI:** конструктор шаблона — группы (↑↓, создать/редактировать/удалить), элементы по группам + «Без группы», Select группы для элемента; экземпляр у пациента врача — панель групп (↑↓, +группа, удалить), сгруппированный список элементов + Select группы; пациент — `<details>` по группам, `schedule_text` в summary, «Без группы» после групп.
- **`api.md`**, чекбоксы в **`STAGE_A3_PLAN.md`** §6.

**Проверки (целевые A3):**

```bash
rg "StageGroup|stage_groups|tplStageGroups|instStageGroups|group_id|schedule_text" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/stage-semantics.test.ts src/modules/treatment-program/progress-service.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx"
pnpm --dir apps/webapp exec eslint "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx" "src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx" "src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx" "src/app/api/doctor/treatment-program-templates/stages/**/*.ts" "src/app/api/doctor/treatment-program-instances/**/*.ts" "src/modules/treatment-program/instance-service.ts" "src/modules/treatment-program/service.ts" "src/infra/repos/inMemoryTreatmentProgram.ts" "src/infra/repos/inMemoryTreatmentProgramInstance.ts"
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** `rg` — ожидаемые вхождения в treatment-program / schema / миграции / API; **vitest** (перечисленные файлы) — PASS; **eslint** (перечисленные файлы) — PASS; **tsc** — PASS.

**Намеренно не делали / остаток:**

- Полный **`pnpm run ci`** не запускался.
- UI экземпляра у врача: редактирование текста группы (title/schedule/description) только через API (`PATCH stage-groups`); в панели — создание/удаление/порядок.

**Продуктовое (A3.5):** пустые группы у пациента скрываются (нет видимых элементов после фильтра disabled).


**Контекст:**

- Аудит: [`AUDIT_STAGE_A2.md`](AUDIT_STAGE_A2.md).

**Сделано:**

- **A2-READ-01:** `omitDisabledInstanceStageItemsForPatientApi` в `stage-semantics.ts`; patient **`GET /api/patient/treatment-program-instances/[instanceId]`** и RSC `patient/treatment-programs/[instanceId]/page.tsx` отдают дерево **без** строк элементов со **`status: "disabled"`** в `stages[].items`. `getInstanceForPatient` / прогресс по-прежнему работают с полным деревом в сервисном слое.
- **A2-TXN-01:** порт **`patchInstanceStageItemWithEvent`** — PG оборачивает update item + insert `treatment_program_events` + touch instance в **`db.transaction`**; in-memory — общий `appendProgramEvent` после patch. `doctorDisableInstanceStageItem` / `doctorEnableInstanceStageItem` при переданном **`events`** используют этот путь; без **`events`** — только `patchInstanceStageItem` (фикстуры без порта событий).
- Тесты: `stage-semantics.test.ts` на read-model helper.
- **`api.md`**, **`AUDIT_STAGE_A2.md`** (§1b, §2, §4, §6, §7).

**Проверки (целевые A2):**

```bash
rg "is_actionable|item_disabled|item_enabled|isStageZero|isPersistentRecommendation|patchInstanceStageItem|patchInstanceStageItemWithEvent|omitDisabledInstanceStageItemsForPatientApi" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/stage-semantics.test.ts src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/treatment-program-events.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec eslint apps/webapp/src/modules/treatment-program/stage-semantics.ts apps/webapp/src/modules/treatment-program/ports.ts apps/webapp/src/modules/treatment-program/instance-service.ts apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts apps/webapp/src/app/api/patient/treatment-program-instances/\[instanceId\]/route.ts apps/webapp/src/app/app/patient/treatment-programs/\[instanceId\]/page.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** `rg` — совпадения только в treatment-program / patient instance API / schema / миграции; **`vitest`** (5 файлов, 41 тест) — PASS; **`eslint`** (перечисленные файлы) — PASS; **`tsc --noEmit`** — PASS.

**Scope / вне scope:**

- In scope: treatment-program instance/events контур (см. §6.6 `AUDIT_STAGE_A2`).
- Out of scope: **courses**, **каталог B4/B7**, шаблонный контент под **A2-LEGACY-01** (defer Info — только документация).

**Minor:**

- **A2-LEGACY-01:** **defer** — правка шаблонов/контент-гайд, не runtime-код этой задачи.

**CI:** полный `pnpm run ci` не запускался (запрос пользователя).

---

## 2026-05-03 — Stage A2 — `is_actionable` / `status` / Этап 0 / disable вместо DELETE

**Контекст:**

- Этапный план: [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md).
- Продуктовое ТЗ: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

**Scope this run:**

- In scope: Drizzle + миграция `0028_treatment_program_a2_instance_item_status.sql` (`is_actionable`, `status`, расширение CHECK `treatment_program_events` для `item_disabled` / `item_enabled`), доменные хелперы, `progress-service` (этап 0, persistent, disabled), `instance-service` (assign: этап 0 + первый FSM-этап; disable/enable; `is_actionable` для recommendation), doctor `PATCH` stage-items (без `DELETE`), UI врача/пациента, целевые тесты, `api.md`.
- Out of scope: группы A3, `program_action_log` A4, бейджи A5, каталог B4.

**Changed files:**

- `apps/webapp/db/schema/treatmentProgramInstances.ts`, `treatmentProgramEvents.ts` — колонки и типы событий.
- `apps/webapp/db/drizzle-migrations/0028_*` + `meta/_journal.json`, `meta/0028_snapshot.json`.
- `apps/webapp/src/modules/treatment-program/stage-semantics.ts`, `types.ts`, `ports.ts`, `instance-service.ts`, `progress-service.ts`.
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`, `inMemoryTreatmentProgramInstance.ts`.
- `apps/webapp/src/app/api/doctor/treatment-program-instances/.../stage-items/[itemId]/route.ts` — PATCH: `status`, `isActionable`; удалён `DELETE`.
- `TreatmentProgramInstanceDetailClient.tsx`, `PatientTreatmentProgramDetailClient.tsx`.
- Тесты: `instance-service.test.ts`, `progress-service.test.ts`, `treatment-program-events.test.ts`.
- `apps/webapp/src/app/api/api.md`, `STAGE_A2_PLAN.md` §2 (O4).

**Composer-safe UI contract evidence:**

- Doctor: `Button`, `Badge`, `Select`, `Dialog`; строки действий `flex flex-wrap items-center gap-2`; пояснение `text-xs text-muted-foreground`; отключённый элемент `opacity-60`.
- Patient: `patientSectionSurfaceClass`, `patientSectionTitleClass`, `patientListItemClass`, `patientMutedTextClass`, `patientPillClass` для «Постоянная рекомендация».

**Checks run:**

```bash
rg "is_actionable|item_disabled|item_enabled|isStageZero|isPersistentRecommendation|patchInstanceStageItem" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/treatment-program-events.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

**Check results:**

- `rg`: совпадения только в treatment-program / schema / миграции / UI / тестах.
- `eslint`: PASS по перечисленным файлам.
- `vitest`: PASS (4 файла, 39 тестов).
- `tsc --noEmit`: PASS.

**Product decisions closed:**

- **O4:** подтверждено в коде и в `STAGE_A2_PLAN.md` §2 — `is_actionable` только на `treatment_program_instance_stage_items`; при назначении для `recommendation` по умолчанию `true` (экземпляр).

**Known residual risk:**

- Шаблоны, где первый клинический этап имел `sort_order = 0` без отдельного «Этапа 0», меняют семантику FSM (оба первых этапа могут стать `available` при наличии этапа 0 + следующего с `sort_order > 0`); legacy с одним этапом `sort_order = 0` остаётся только «общие рекомендации» без автозавершения этапа по элементам.

**Next step:**

- Этап A3 по `STAGE_A3_PLAN.md`.

---

## 2026-05-03 — FIX по AUDIT_STAGE_A1 (документация A1 + чек-лист плана)

**Контекст:**

- Аудит: [`AUDIT_STAGE_A1.md`](AUDIT_STAGE_A1.md) — minor A1-DOC-01, A1-DOC-02.

**Сделано:**

- `apps/webapp/src/app/api/api.md` — синхронизация с контрактом A1: шаблонные этапы (POST/PATCH + поля), PATCH этапа инстанса (статус и/или мета, skipped+reason, ответ), GET инстанса (A1 в `stages`), POST создания инстанса (deep copy четырёх полей с этапа шаблона).
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A1_PLAN.md` §6 — все пункты `[x]`.
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A1.md` §4 — статусы закрытия minor + блок Post-FIX.
- `PatientTreatmentProgramDetailClient.test.tsx` — явный `import { describe, expect, it } from "vitest"` для `tsc --noEmit` (как в остальных unit-тестах webapp).

**Проверки (повтор A1, целевые):**

```bash
rg "goals|objectives|expected_duration" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/progress-service.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

**Результаты:** `rg` — только treatment-program/webapp DB; `vitest` — PASS; `tsc --noEmit` — PASS после импорта Vitest в patient-тесте.

**Вне scope:** логика treatment-program не менялась; правки — `api.md`, initiative docs, одна строка импорта в тесте.

---

## 2026-05-03 — Stage A1 — Цели/задачи/срок этапа (template + instance)

**Контекст:**

- Этапный план: [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md).
- Продуктовое ТЗ: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

**Scope this run:**

- In scope: Drizzle schema + миграция `0025_*`, типы, repos (pg + in-memory), `instance-service` (копирование при назначении + `doctorUpdateInstanceStageMetadata`), `service` (trim/валидация дней), doctor API (шаблон + инстанс stage PATCH), конструктор шаблона, карточка программы пациента у врача, шапка этапа у пациента, целевые тесты.
- Out of scope: группы A3, `is_actionable` A2, `program_action_log` A4, бейджи A5, markdown-рендер (только plain/pre-wrap текст).

**Changed files:**

- `apps/webapp/db/schema/treatmentProgramTemplates.ts`, `treatmentProgramInstances.ts` — колонки этапа.
- `apps/webapp/db/drizzle-migrations/0025_treatment_program_stage_goals_objectives_duration.sql` + `meta/*` — миграция Drizzle.
- `apps/webapp/src/modules/treatment-program/types.ts`, `ports.ts`, `service.ts`, `instance-service.ts` — контракт и копирование.
- `apps/webapp/src/infra/repos/pgTreatmentProgram*.ts`, `inMemoryTreatmentProgram*.ts` — чтение/запись полей.
- `apps/webapp/src/app/api/doctor/treatment-program-templates/.../stages/*`, `.../stages/[stageId]/route.ts`, `.../treatment-program-instances/.../stages/[stageId]/route.ts` — Zod + тонкие handlers.
- `TreatmentProgramConstructorClient.tsx`, `TreatmentProgramInstanceDetailClient.tsx`, `PatientTreatmentProgramDetailClient.tsx` — UI по §5 STAGE_A1.
- Тесты: `instance-service.test.ts`, `progress-service.test.ts`, `PatientTreatmentProgramDetailClient.test.tsx` (новый).
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A1_PLAN.md` — явная фиксация O1 в §2.

**Execution checklist:**

1. Schema/migration: nullable TEXT/INT на `treatment_program_template_stages` и `treatment_program_instance_stages`.
2. Domain/service: копирование полей в `assignTemplateToPatient`; нормализация PATCH для инстанса.
3. Route/action: расширен PATCH шаблона и инстанса (метаданные без обязательного `status`).
4. Doctor UI: шаблон + инстанс — блок по composer-safe §5.
5. Patient UI: шапка этапа, скрытие пустых полей.
6. Tests/docs: копирование, patient render, правки фикстур `progress-service.test.ts`.

**Composer-safe UI contract evidence:**

- Doctor: `Button`, `Input`, `Label`, `Textarea`; обёртка `rounded-md border border-border/60 bg-muted/20 p-3` / `flex flex-col gap-3`; подписи и `text-xs text-muted-foreground` для подсказок.
- Patient: `patientSectionSurfaceClass`, `patientSectionTitleClass`, `patientBodyTextClass`, `patientMutedTextClass` из `patientVisual.ts`.
- Без raw `<button>`; без импортов из `patient/home`.

**Checks run:**

```bash
rg "goals|objectives|expected_duration" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/service.test.ts src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

**Check results:**

- `rg`: выполнен по затронутым путям; новые символы в schema/repos/modules/api/UI/tests.
- `eslint`: PASS по перечисленным файлам (после исправления exhaustive-deps на constructor).
- `vitest`: PASS на целевых файлах выше.
- `typecheck`: PASS (`pnpm --dir apps/webapp exec tsc --noEmit`).

**Product decisions closed:**

- **O1:** `objectives` остаётся **TEXT (markdown)** на template/instance stage; JSONB-чеклист не добавлялся (см. JSDoc в Drizzle `treatmentProgramTemplates.ts` и `STAGE_A1_PLAN.md` §2).

**Known residual risk:**

- Текст целей на пациенте выводится как plain / `whitespace-pre-wrap`, без рендера markdown (ожидаемо для A1).

**Next step:**

- Этап A2 по `STAGE_A2_PLAN.md`.

---

## 2026-05-03 — Добавлен файл промптов EXEC/AUDIT/FIX/GLOBAL (docs-only)

**Контекст:**

- Пользователь попросил создать файл с промптами для инициативы «как в других инициативах».

**Сделано:**

- Создан файл [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md) с copy-paste промптами:
  - общий блок правил;
  - циклы `EXEC -> AUDIT -> FIX` для этапов `A1..A5`;
  - `GLOBAL AUDIT`, `GLOBAL FIX`, `PREPUSH POSTFIX AUDIT`;
  - явная фиксация scope: только `treatment-program`-контур в промптах и планах.
- Обновлён [`README.md`](README.md): добавлена ссылка на новый файл промптов.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Любые изменения бизнес-логики и runtime-кода.

---

## 2026-05-03 — Уточнение инструкций по scope: только treatment-program контур (docs-only)

**Контекст:**

- Пользователь запросил явно зафиксировать в инструкциях, что работы по инициативе остаются в `treatment-program`-контуре webapp.

**Сделано:**

- Обновлён [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - в scope добавлено явное правило «держаться в treatment-program-контуре»;
  - в out-of-scope уточнены соседние инициативы (курсы, каталоги B1–B7 и т.д.).
- Уточнены allowed/do-not-edit в этапах:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md)
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md)
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md)
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md)
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md)
- Во всех этапах patient-path сужен до `apps/webapp/src/app/app/patient/treatment-programs/**` вместо широкого `patient/**`.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Любые изменения вне перечисленных docs инициативы.

---

## 2026-05-03 — Пред-реализационная фиксация решений и карты кодовой базы (docs-only)

**Контекст:**

- Пользователь попросил принять необходимые решения заранее и дополнить документацию до старта кода.
- Цель: снять неопределённость по stage-gates (O1/O2/O3/O4) и заранее зафиксировать конкретные модули/роуты/схемы.

**Сделано:**

- Обновлён [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - добавлен §3.1 с картой кодовой базы (domain, doctor/patient API, patient/doctor UI, Drizzle schema);
  - зафиксированы решения по O1/O2/O3/O4 в stage-gates.
- Обновлены этапные планы:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) — O1 закреплён как `objectives TEXT`, добавлены явные API-зоны.
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md) — O4 закреплён как instance-only `is_actionable`, добавлены явные API-зоны.
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md) — добавлены целевые API-зоны для стадий/групп.
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md) — O2/O3 закреплены (complex-level + note в action_log), добавлены явные API-зоны.
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md) — добавлены конкретные patient API точки для mark-viewed/read.
- Синхронизирован продуктовый ТЗ [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md):
  - §1.3: `objectives` закреплён как `TEXT`;
  - §1.5: добавлено поле `note` в `program_action_log`;
  - §5: удалены O1-O4 из открытых вопросов;
  - §8.3: добавлен блок принятых решений и ссылка на execution-карту.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация A1-A5 в коде.

---

## 2026-05-03 — Усиление планов под composer-safe исполнение (docs-only)

**Контекст:**

- Пользователь попросил проверить достаточность папки и затем усилить планы «для композера»: больше декомпозиции, явные UI-компоненты, теги, классы и запреты там, где есть риск ошибиться.

**Сделано:**

- Добавлен [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) — шаблон обязательной записи после каждого EXEC/FIX прохода.
- Добавлен [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) — шаблон stage/full audit.
- Усилен [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - добавлен `Composer-Safe Execution Standard`;
  - перечислены разрешённые UI primitives для doctor/admin и patient UI;
  - перечислены запреты (home-only стили, raw controls, новые UI-библиотеки, direct infra imports);
  - добавлены stage-gates по O1/O2/O3/O4 и backfill A5;
  - добавлено правило обязательного LOG/audit после этапов.
- Полностью усилены этапные планы:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) — schema/service/UI цепочка, allowed files, doctor/patient UI contract, atomized steps, rollback.
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md) — actionable/persistent/disabled/Stage 0, event semantics, UI labels/classes, hard delete ban.
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md) — group tables, no drag dependency, explicit move controls, native `<details>/<summary>` fallback for patient groups.
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md) — action log, checklist, session form, doctor inbox, exact UI labels, no pain scale/per-exercise comments.
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md) — backfill gate, mark-viewed idempotency, badge labels/classes, cache revalidation.
- Обновлён [`README.md`](README.md) — добавлены ссылки на templates.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация A1–A5 в коде.

---

## 2026-05-03 — Инициализация папки инициативы (docs-only)

**Сделано:**

- Создана папка `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE`.
- Добавлены: `README.md`, `MASTER_PLAN.md`, `STAGE_A1_PLAN.md` ... `STAGE_A5_PLAN.md`, `LOG.md`.
- Проставлены связи с roadmap и продуктовым ТЗ.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация этапов A1–A5 в коде.
