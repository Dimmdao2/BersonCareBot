# LOG — PROGRAM_PATIENT_SHAPE_INITIATIVE

Формат: дата, этап (A1...A5), что сделано, проверки, решения, вне scope.

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
