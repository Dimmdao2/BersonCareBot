# Журнал — PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE

Формат: дата, что сделано, проверки, решения, вне scope.

---

## 2026-05-04 — GLOBAL FIX (после [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md))

**Сделано (документы / Major из §8 AUDIT_GLOBAL):**

- [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §0: строка о закрытии **1.0 + 1.1a + 1.1** со ссылкой на [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md); §1.1 и §1.1a: команда `lint` с путём `src/app/app/patient/treatment-programs` (канон при `--dir apps/webapp`).
- [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md): запись **GLOBAL FIX** со ссылками на эту папку и обоснованием **DEFER** по ретроспективной правке `TestSetForm.test.tsx` (не откатывать; на будущее — отдельный коммит/PR).
- [`README.md`](README.md): статус закрытия A/B/C + ссылка на `AUDIT_GLOBAL.md`; в таблицу документов добавлен `AUDIT_GLOBAL.md`.
- [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md): чекбоксы отмечены `[x]` по факту закрытия этапов; в **B/C** исправлен аргумент `lint` на `src/app/...` (согласовано с рабочими прогонами этапов).

**Проверки (узко, зона `patient/treatment-programs`):**

- `rg "Завершённые программы|Завершенные программы|План обновлён|% этапа|% программы|% за день" apps/webapp/src/app/app/patient/treatment-programs` — ok.
- `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` — ok.

**Не запускались в этом шаге:** полный корневой `pnpm run ci` (см. [`STAGE_PLAN.md`](STAGE_PLAN.md) DoD п.6 — только перед push).

**Приложение [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md):** в конце файла добавлен блок **GLOBAL FIX closure** (синхронизация §6–§9 с фактом правок).

---

## 2026-05-04 — post-audit: устойчивость `patientPlanUpdatedBadgeForInstance` (RSC)

**Сделано:** разведены ошибки загрузки экземпляра и ошибки `patientPlanUpdatedBadgeForInstance` на detail; на списке nudge в отдельном `try/catch` — при сбое бейдж скрывается, страница не падает. Регресс-тесты: `page.nudgeResilience.test.tsx`, `[instanceId]/page.nudgeResilience.test.tsx`.

**Проверки:** `vitest` (2 файла, 3 теста); `pnpm --dir apps/webapp exec tsc --noEmit`; `eslint` по `page.tsx`, `[instanceId]/page.tsx` и двум тестам.

**Документы:** [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) §6 помечен как исторический снимок; §7/§9 актуализированы; добавлен **§11** (post-audit code).

---

## 2026-05-04 — этап C (1.1): список `/treatment-programs`

### read-rules (STAGE_PLAN gate)

Перед правками кода прочитаны обязательные rules из [`STAGE_PLAN.md`](STAGE_PLAN.md) (блок «Жесткий gate перед любым исполнением»):

- `.cursor/rules/plan-authoring-execution-standard.mdc`
- `.cursor/rules/test-execution-policy.md`
- `.cursor/rules/pre-push-ci.mdc`
- `.cursor/rules/push-means-ci-commit-push.mdc`
- `.cursor/rules/git-commit-push-full-worktree.mdc`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/patient-ui-shared-primitives.mdc`

### Закрытие этапа B (предпосылка C)

Этап **B** считается закрытым по DoD: реализация 1.1a + [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) **FIX closure** + запись **AUDIT_STAGE_B FIX** в этом [`LOG.md`](LOG.md).

### scope

**В scope:** только [`STAGE_C.md`](STAGE_C.md) — `page.tsx` + [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx) + локальные тесты списка; чтение `listForPatient`, `getInstanceForPatient` (один активный экземпляр для `current_stage_title`), `patientPlanUpdatedBadgeForInstance`, таймзона для «План обновлён».

**Вне scope:** деталь `[instanceId]` (UX B), миграции/`started_at` write-path, проценты прогресса.

### Сделано (реализация 1.1)

- RSC `page.tsx`: активная программа (первая по `updatedAt` среди `status === "active"`), загрузка detail для заголовка текущего этапа через `patientProgramsListCurrentStageTitle` (семантика как на detail: `split` + `selectCurrentWorkingStageForPatientDetail` по pipeline без этапа 0), бейдж «План обновлён» как на Today/detail, архив `completed` в `<details>` «Завершённые программы» без `open`, empty state по ROADMAP («Здесь появится программа…» + ссылка на сообщения).
- [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx): hero / empty / архив; примитивы `patientVisual` + `Link`.
- [`PatientTreatmentProgramsListClient.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx): заголовок этапа, разделение от этапа 0, empty, hero, архив в закрытом `details`.

### checks (план)

- Команды из [`STAGE_C.md`](STAGE_C.md) «Локальные проверки» (`rg`, lint с путём от `apps/webapp`, `tsc`, `vitest` по `src/app/app/patient/treatment-programs`).

### checks (результаты)

- `rg "Завершённые программы|Завершенные программы|План обновлён|% этапа|% программы|% за день" apps/webapp/src/app/app/patient/treatment-programs` — ok (совпадения без `% этапа`/`% программы`/`% за день`; «Завершённые программы» / «План обновлён» — ожидаемо в list/detail).
- `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` — ok.
- `pnpm --dir apps/webapp exec tsc --noEmit` — ok.
- `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` — ok (**11** тестов: detail client + list client).

### out-of-scope

По [`STAGE_C.md`](STAGE_C.md): деталь B, data-layer/migrations для `started_at`, процентная аналитика.

---

## 2026-05-04 — AUDIT_STAGE_C FIX (closure Critical/Major/Minor/INFO, повтор проверок)

**Сделано:**

- По [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md): таблица **FIX closure** — Critical/Major закрыты верификацией (0 finding’ов; сценарии MANDATORY не воспроизведены); Minor из MANDATORY §Minor закрыты **верификацией** (CTA/`patientTreatmentProgram`, `messagesHref`, vitest списка); **INFO-1** закрыт выравниванием чек-листа в [`STAGE_C.md`](STAGE_C.md) с ROADMAP/UI (написание «**Завершённые** программы» с буквой **ё**).
- Код приложения списка **не менялся** (дефектов не было).

**Проверки (целевые команды этапа C):**

- `rg "Завершённые программы|Завершенные программы|План обновлён|% этапа|% программы|% за день" apps/webapp/src/app/app/patient/treatment-programs` — ok.
- `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` — ok.
- `pnpm --dir apps/webapp exec tsc --noEmit` — ok.
- `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` — ok (**11** тестов).

---

## 2026-05-04 — этап B (1.1a): detail `[instanceId]` MVP

### read-rules (STAGE_PLAN gate)

Перед UI-правками прочитаны те же обязательные rules, что в [`STAGE_PLAN.md`](STAGE_PLAN.md) (блок «Жесткий gate перед любым исполнением»):

- `.cursor/rules/plan-authoring-execution-standard.mdc`
- `.cursor/rules/test-execution-policy.md`
- `.cursor/rules/pre-push-ci.mdc`
- `.cursor/rules/push-means-ci-commit-push.mdc`
- `.cursor/rules/git-commit-push-full-worktree.mdc`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/patient-ui-shared-primitives.mdc`

### Закрытие этапа A (предпосылка B)

Этап **A** считается закрытым по DoD: `started_at` в схеме/миграции/репозиториях, [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) FIX closure, целевые проверки A зафиксированы в этом [`LOG.md`](LOG.md).

### scope

**В scope:** только [`STAGE_B.md`](STAGE_B.md) — `page.tsx` + `PatientTreatmentProgramDetailClient.tsx` + при необходимости `stage-semantics.ts`; чтение готовых полей (`started_at`, `patientPlanLastOpenedAt`, события плана через сервис).

**Вне scope:** миграции/запись `started_at`, список `/treatment-programs` (этап C), проценты, комментарий к факту выполнения.

### Сделано (реализация 1.1a)

- `stage-semantics.ts`: `TreatmentProgramInstanceDetailStageRow`, `splitPatientProgramStagesForDetailUi`, `selectCurrentWorkingStageForPatientDetail`, `expectedStageControlDateIso` (контроль от `startedAt` + `expectedDurationDays`).
- `page.tsx`: таймзона приложения, бейдж «План обновлён» через `patientPlanUpdatedBadgeForInstance` + `formatBookingDateLongRu`.
- `PatientTreatmentProgramDetailClient.tsx`: hero (текущий этап, контрольная дата, CTA «Открыть текущий этап», ссылка «Архив этапов»), блок «Общие рекомендации» для `sortOrder === 0`, один рабочий этап, архив в `<details id="program-archive">`, без «Чек-лист на сегодня»; ссылка на архив — `<a>` + `buttonVariants` (без `asChild` на base-ui `Button`).
- Тесты: `stage-semantics.test.ts` (split/select/expected), `PatientTreatmentProgramDetailClient.test.tsx` (новые props, отсутствие чек-листа, label «План обновлён»).

### checks (план)

- Команды из [`STAGE_B.md`](STAGE_B.md) «Локальные проверки» (с поправкой путей eslint при `cwd` = `apps/webapp`, если корневой префикс не матчится).

### checks (результаты)

- `rg "Чек-лист на сегодня|План обновлён|expected_duration_days|started_at" apps/webapp/src/app/app/patient/treatment-programs` — ok (совпадения только в `page.tsx` / тестах; `expected_duration_days`/`started_at` в этом дереве не встречаются в TS — поля приходят из API как camelCase в типах).
- `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` — ok (скрипт: `eslint .` + media-invariants с переданным путём).
- `pnpm --dir apps/webapp exec tsc --noEmit` — ok.
- `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs src/modules/treatment-program/stage-semantics.test.ts` — ok (**21** тест: detail client + stage-semantics, включая блок 1.1a).

### out-of-scope

По [`STAGE_B.md`](STAGE_B.md): миграции/`started_at` write-path, список программ (C), проценты, комментарий к факту выполнения — не трогались.

---

## 2026-05-04 — AUDIT_STAGE_B FIX (closure Critical/Major/Minor, INFO defer, повтор проверок)

**Сделано:**

- По [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md): таблица **FIX closure** — Critical/Major закрыты верификацией (0 finding’ов на аудите; сценарии MANDATORY не воспроизведены); Minor из MANDATORY-чеклиста закрыты **верификацией кода** (якорь `#patient-program-current-stage` + `ref`, `href="#program-archive"` ↔ `id="program-archive"`, vitest 1.1a); **INFO-1** (`/checklist-today` без UI-секции для `doneItemIds`) — **DEFER** с обоснованием в AUDIT (отдельный шаг при требовании «ноль запросов» с detail).
- **Попутно:** в [`TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx) восстановлена обёртка `it(...)` (фрагмент теста оказался вне `describe`-блока) — иначе `pnpm --dir apps/webapp exec tsc --noEmit` падал на всём пакете webapp; к этапу B не относится.

**Проверки (целевые команды этапа B + audit §3):**

- `rg "Чек-лист на сегодня|План обновлён|expected_duration_days|started_at" apps/webapp/src/app/app/patient/treatment-programs` — ok.
- `rg "Чек-лист на сегодня|План обновлён" apps/webapp/src/app/app/patient/treatment-programs` — ok (как в [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §3).
- `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` — ok.
- `pnpm --dir apps/webapp exec tsc --noEmit` — ok.
- `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs src/modules/treatment-program/stage-semantics.test.ts` — ok (**21** тест).
- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/test-sets/TestSetForm.test.tsx` — ok (**4** теста; после правки обёртки `it`).

---

## 2026-05-04 — AUDIT_STAGE_A FIX (закрытие Critical/Major, minor, повтор проверок)

**Сделано:**

- По [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md): секция **FIX closure** — Critical/Major закрыты верификацией (`0043` + `_journal.json`, типы/`mapStage`/SQL vs LOG, guard `startedAtForPatch`).
- **Minor:** обновлены локальные проверки в [`STAGE_A.md`](STAGE_A.md) (`rg "started_at|startedAt"`, vitest + контрактный тест); чек-лист п.4 — ссылка на контрактный тест и defer live PG в AUDIT; комментарий у `startedAtForPatch` в `pgTreatmentProgramInstance.ts`; добавлен [`../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts).
- **Defer (обосновано в AUDIT):** полный PG integration для instance-tree не введён (`test:with-db` / `USE_REAL_DATABASE` без treatment-program сценария).

**Проверки (целевые команды этапа A, post-FIX):**

- `rg "started_at|startedAt" apps/webapp/db/schema/treatmentProgramInstances.ts apps/webapp/src/modules/treatment-program apps/webapp/src/infra/repos` — ok.
- `pnpm --dir apps/webapp exec tsc --noEmit` — ok (exit 0).
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts` — ok (**25** tests: 24 + 1).

---

## 2026-05-04 — перепаковка prompts под конвейер `A/B/C -> global -> prepush`

**Сделано:**

- Файл [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md) переписан в формате других инициатив (`PROMPTS_EXEC_AUDIT_FIX_GLOBAL`-стиль): для каждого этапа только `EXEC`, `AUDIT`, `FIX`, затем единые `GLOBAL AUDIT`, `GLOBAL FIX`, `PREPUSH POSTFIX AUDIT`.
- Убрана старая схема, где `audit/fix/prepush/push` дублировались отдельно для каждого этапа.
- Добавлен alias `adit-global` для `GLOBAL AUDIT`.
- В [`STAGE_PLAN.md`](STAGE_PLAN.md) и [`README.md`](README.md) синхронизированы названия действий под новый конвейер.

**Проверки:** docs-only; runtime-код не менялся.

---

## 2026-05-04 — ужесточение планов и prompts-пакет

**Сделано:**

- Прочитаны обязательные документы/правила перед правками: `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, `.cursor/rules/plan-authoring-execution-standard.mdc`, `.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`, `.cursor/rules/push-means-ci-commit-push.mdc`, `.cursor/rules/git-commit-push-full-worktree.mdc`.
- В [`STAGE_PLAN.md`](STAGE_PLAN.md) добавлен жесткий gate: чтение rules + обязательная запись в `LOG.md` до старта работ.
- В [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md) расширены подробные чек-листы: gate, scope in/out, детальные шаги реализации, команды проверок, DoD с требованием логирования.
- Добавлен [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md): копипаст-конвейер `A/B/C (EXEC->AUDIT->FIX)` + `GLOBAL AUDIT` + `GLOBAL FIX` + `PREPUSH POSTFIX`.
- В [`README.md`](README.md) добавлена ссылка на prompts-файл и зафиксировано жесткое правило исполнения.

**Проверки:** docs-only; код/runtime не менялись.

---

## 2026-05-04 — планы этапов: три файла `STAGE_A` / `STAGE_B` / `STAGE_C`

**Решение:** один файл на букву этапа (**A**, **B**, **C**), без суффиксов вида `A1`/`B2` и без имён `STAGE_A_1_0` (путаница с поднумерацией). Содержимое чек-листов — в [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md); [`STAGE_PLAN.md`](STAGE_PLAN.md) — только индекс + DoD мини-инициативы.

**Проверки:** docs-only.

---

## 2026-05-04 — инфраструктура инициативы (docs-only)

**Сделано:**

- Создана папка `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/` с `README.md`, `STAGE_PLAN.md`, `LOG.md`.
- Зафиксирована последовательность исполнения **A (1.0) → B (1.1a) → C (1.1)** и MVP-инварианты (без процентной аналитики; `started_at` для даты контроля).
- Навигация: ссылки из корневого [`../README.md`](../README.md) (активные инициативы), [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md) (таблица файлов, блок новых инициатив, «Связанные документы»), [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md); в [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) — блок «Связанные документы», §3 и шаг §9 с указанием на эту папку.

**Проверки:** только структура документов; код не менялся.

---

## 2026-05-04 — этап A (exec-audit-fix-global): `started_at` data enabler

**Сделано:**

- Drizzle: колонка `started_at` (`timestamptz`, nullable) на `treatment_program_instance_stages`.
- Миграция `0043_treatment_program_instance_stage_started_at.sql` + запись в `db/drizzle-migrations/meta/_journal.json`.
- Backfill: `UPDATE` для строк `status = 'in_progress'` с `NULL` → `started_at = treatment_program_instances.created_at`.
- Тип `TreatmentProgramInstanceStageRow.startedAt`; маппинг read/write в `pgTreatmentProgramInstance` и симметрия в `inMemoryTreatmentProgramInstance` (insert при `in_progress`, первый переход в `in_progress` в `updateInstanceStage`, без перезаписи если уже задано).
- Тесты в `progress-service.test.ts` (touch, doctor idempotent, create с начальным `in_progress`); фикстуры `startedAt` в связанных тестах.

### read-rules (STAGE_PLAN gate)

Перед правками кода прочитаны:

- `.cursor/rules/plan-authoring-execution-standard.mdc`
- `.cursor/rules/test-execution-policy.md`
- `.cursor/rules/pre-push-ci.mdc`
- `.cursor/rules/push-means-ci-commit-push.mdc`
- `.cursor/rules/git-commit-push-full-worktree.mdc`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/patient-ui-shared-primitives.mdc`

### scope

**В scope (только этап A):** колонка `started_at` на `treatment_program_instance_stages`, миграция + backfill для строк `status = 'in_progress'`, типы `TreatmentProgramInstanceStageRow`, `pgTreatmentProgramInstance` / `inMemoryTreatmentProgramInstance`, установка при первом переходе в `in_progress` (и при создании этапа уже в `in_progress`), тесты progress/instance.

**Вне scope:** UI detail/list (B/C), прочие модули, полный `pnpm run ci` в этом шаге (по test-execution-policy — локальные проверки этапа A).

### checks (план на шаг)

- `rg "started_at|startedAt"` по путям из `STAGE_A.md`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts`
- `pnpm --dir apps/webapp lint` по изменённым TS-файлам (audit-global)
- **Backfill (зафиксировано):** для существующих строк `in_progress` с `NULL` → `started_at = treatment_program_instances.created_at`. Для `completed` / `skipped` / `locked` / `available` без исторического времени старта поле остаётся `NULL` (нет надёжной эвристики).

### audit-findings / fixes

- **Critical issues:** не найдены.
- **Info:** `progress-service.ts` из списка разрешённых файлов STAGE_A не менялся — выставление `started_at` сделано в `TreatmentProgramInstancePort.updateInstanceStage` и при insert этапа (pg + inMemory), что покрывает patient touch и `doctorSetStageStatus`.
- **Tooling:** первый прогон ESLint с путями от корня репозитория не сматчил файлы; повтор с `cwd` = `apps/webapp` — ok.

### checks (результаты)

- `rg "started_at|startedAt"` по областям этапа A — ok.
- `pnpm --dir apps/webapp exec tsc --noEmit` — **ok** (exit 0).
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts` — **ok** (24 tests).
- Дополнительно: `vitest run` для `instance-service.test.ts`, `stage-semantics.test.ts`, `PatientTreatmentProgramDetailClient.test.tsx`, `patient-program-actions.test.ts` — **ok** (30 tests суммарно в этом прогоне).
- `pnpm exec eslint` из `apps/webapp` по изменённым TS — **ok** (exit 0).

### out-of-scope

- Этапы **B** / **C** (UI detail `/[instanceId]`, список `/treatment-programs`).
- Полный корневой `pnpm run ci` (не запрашивался; см. test-execution-policy).
- Правки в `PatientTreatmentProgramDetailClient.test.tsx` и `patient-program-actions.test.ts` — только поле `startedAt: null` в фикстурах под обновлённый тип `TreatmentProgramInstanceStageRow` (не фича UI).
