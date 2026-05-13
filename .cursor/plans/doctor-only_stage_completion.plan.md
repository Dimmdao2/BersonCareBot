---
name: Doctor-only stage completion
overview: Привести логику этапов к правилу «закрытие этапа только врачом»: убрать автозавершение этапа из пациентских путей, сохранить пациентский переход `available -> in_progress`, переписать тесты и обновить каноническую документацию + repair-runbook для уже ошибочно закрытых этапов.
todos:
  - id: preflight-and-scope
    content: Зафиксировать scope, прочитать релевантные правила/доки, проверить runtime-использование maybeCompleteStageFromItems перед удалением
    status: pending
  - id: remove-patient-autocomplete
    content: Удалить maybeCompleteStageFromItems и его вызовы из patientCompleteSimpleItem/patientSubmitTestResult; не менять doctorSetStageStatus
    status: pending
  - id: rewrite-tests
    content: Переписать progress-service.test.ts и смежные ожидания на модель doctor-only completion
    status: pending
  - id: module-regression
    content: Прогнать регрессию по apps/webapp/src/modules/treatment-program и целевые проверки lint/typecheck/test
    status: pending
  - id: docs-and-log
    content: Обновить docs/ARCHITECTURE и добавить execution log в профильной папке docs по выполненным шагам
    status: pending
  - id: repair-runbook
    content: Описать безопасный repair-path для уже ошибочно закрытых этапов (без стандартного doctor UI)
    status: pending
isProject: false
---

# План: doctor-only завершение этапа (максимально усиленный)

## 1) Цель и продуктовый инвариант

До явного действия врача (`completed`/`skipped` этапа) система **не имеет права** автоматически закрывать этап на основании пациентских отметок или результатов тестов. Пациент может:

- писать `completed_at` по пунктам,
- отправлять результаты тестов,
- переводить этап `available -> in_progress` при первом действии.

Пациент **не может** переводить этап в `completed`.

## 2) Подтвержденная корневая причина

- Автозакрытие живет в [`apps/webapp/src/modules/treatment-program/progress-service.ts`](apps/webapp/src/modules/treatment-program/progress-service.ts): `maybeCompleteStageFromItems`.
- Вызывается из пациентских сценариев:
  - `patientCompleteSimpleItem`,
  - `patientSubmitTestResult` (ветка `allDone`).
- При `completed`/`skipped` [`apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`](apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts) делает unlock следующего этапа (`locked -> available`), что усиливает побочный эффект.
- На пациентской стороне `completed`-этап выбывает из pipeline (`splitPatientProgramStagesForDetailUi` / `selectCurrentWorkingStageForPatientDetail`), из-за чего в ряде сценариев «программа исчезает из Плана».

## 3) Scope boundaries (жестко)

### Разрешено менять

- [`apps/webapp/src/modules/treatment-program/progress-service.ts`](apps/webapp/src/modules/treatment-program/progress-service.ts)
- [`apps/webapp/src/modules/treatment-program/progress-service.test.ts`](apps/webapp/src/modules/treatment-program/progress-service.test.ts)
- связанные тесты в [`apps/webapp/src/modules/treatment-program/`](apps/webapp/src/modules/treatment-program/)
- канонические docs в [`docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`](docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md) и/или [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md)
- execution log в `docs` (см. шаг 5)

### Явно вне scope

- схемы БД/миграции;
- новый UI «Вернуть этап в работу»;
- массовый автоматический backfill по прод-данным;
- изменения CI workflow.

Любое расширение scope — только после согласования.

## 4) Целевая архитектура (после фикса)

```mermaid
flowchart LR
  subgraph patientFlow [Пациент]
    A["patientCompleteSimpleItem or patientSubmitTestResult"] --> B["set item completed_at or test result"]
    B --> C["stage remains available or in_progress"]
  end
  subgraph doctorFlow [Врач]
    D["PATCH stage status"] --> E["doctorSetStageStatus"]
    E --> F["updateInstanceStage completed or skipped"]
    F --> G["unlock next locked stage"]
  end
```

## 5) Пошаговый план с локальными чек-листами

### Шаг 0. Preflight и защита от scope creep

- Прочитать и зафиксировать релевантные правила/доки.
- Подтвердить `rg`-поиском, что `maybeCompleteStageFromItems` используется только в ожидаемых местах runtime.
- Проверить, что врачебный путь `doctorSetStageStatus` уже покрывает `completed/skipped`.

Чек-лист верификации:
- `rg "maybeCompleteStageFromItems" apps/webapp/src`
- `rg "doctorSetStageStatus|updateInstanceStage\\(" apps/webapp/src/modules/treatment-program apps/webapp/src/app/api/doctor`
- Зафиксировать результат в execution log.

### Шаг 1. Удалить автозавершение этапа из пациентских путей

- Удалить функцию `maybeCompleteStageFromItems`.
- Удалить оба вызова из:
  - `patientCompleteSimpleItem`,
  - `patientSubmitTestResult` (ветка `allDone`).
- Удалить неиспользуемые импорты в файле.
- Не трогать `doctorSetStageStatus`.

Чек-лист верификации:
- `rg "maybeCompleteStageFromItems" apps/webapp/src` => 0 runtime совпадений.
- `rg "patientTouchStageItemInner" apps/webapp/src/modules/treatment-program/progress-service.ts` => переход `available -> in_progress` сохранен.

### Шаг 2. Переписать тесты под doctor-only completion

- Обновить `progress-service.test.ts`:
  - сценарий «все пункты выполнены»:
    - после пациента этап НЕ `completed`, следующий этап остается `locked`;
    - после `doctorSetStageStatus(completed)` этап `completed`, следующий `available`.
  - сценарии `clinical_test` (numeric/qualitative/multi-test):
    - убрать ожидание автозакрытия этапа пациентом;
    - убрать ожидание `stage_completed` как следствия пациентского действия;
    - при необходимости добавить врачебный завершающий шаг.
  - сценарии A2 с actionable/persistent рекомендациями:
    - оставить доменные ограничения;
    - исключить автозакрытие этапа пациентом.

Чек-лист верификации:
- `pnpm vitest run apps/webapp/src/modules/treatment-program/progress-service.test.ts`
- `rg "stage_completed|status\\)\\.toBe\\(\"completed\"\\)" apps/webapp/src/modules/treatment-program/progress-service.test.ts` и ручная проверка, что новые ожидания корректны.

### Шаг 3. Регрессия по модулю treatment-program

- Поиск неявных ожиданий старой семантики в соседних тестах/модулях.
- Прогон всего тестового поддерева `treatment-program`.

Чек-лист верификации:
- `rg "patientCompleteSimpleItem|patientSubmitTestResult|stage_completed|status.*completed" apps/webapp/src/modules/treatment-program`
- `pnpm vitest run "apps/webapp/src/modules/treatment-program/**/*.test.ts"`
- при необходимости целевой `pnpm --filter webapp lint` / `pnpm --filter webapp typecheck` на затронутой области.

### Шаг 4. Обновить каноническую документацию

- В [`docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`](docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md) добавить раздел FSM этапа:
  - пациент не закрывает этап;
  - `available -> in_progress` при пациентском действии сохраняется;
  - `completed/skipped` — только врачебное действие.
- В [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md) (2.9, экземпляры программ) кратко закрепить ту же семантику.

Чек-лист верификации:
- `rg "completed.*patient|doctor.*completed|in_progress" docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md docs/ARCHITECTURE/DB_STRUCTURE.md`
- Проверить, что не правятся immutable/archive docs.

### Шаг 5. Execution log (обязательный)

- Создать/обновить профильный лог в docs:
  - предпочтительно [`docs/ARCHITECTURE/LOG_DOCTOR_ONLY_STAGE_COMPLETION.md`](docs/ARCHITECTURE/LOG_DOCTOR_ONLY_STAGE_COMPLETION.md)
  - либо существующий релевантный LOG.md (если есть явный owner этой инициативы).
- Для каждого шага зафиксировать:
  - что сделано,
  - какие проверки выполнены,
  - какие решения приняты,
  - что намеренно не делали.

Чек-лист верификации:
- файл лога существует и содержит timestamped записи;
- ссылки на команды/результаты проверок присутствуют.

### Шаг 6. Repair-runbook для уже затронутых данных

- Зафиксировать в docs/PR runbook:
  - стандартный doctor UI блокирует действия на `completed/skipped` (`stageActionsLocked`);
  - откат ошибочно закрытого этапа выполняется только согласованным ops-способом:
    1) прямой PATCH API врача (под контролем),
    2) SQL-операция с учетом возможного unlock следующего этапа.
- Добавить явные критерии, когда использовать PATCH vs SQL.

Чек-лист верификации:
- runbook содержит preconditions, steps, post-check SQL/API, rollback пункт.

## 6) Риски и меры

- Риск: скрытые тестовые ожидания старой семантики -> закрываем шагом 3 (full module regression).
- Риск: неочевидный процесс восстановления данных -> закрываем шагом 6 (runbook).
- Риск: случайно сломать `available -> in_progress` -> отдельный чек в шаге 1 и тесты в шаге 2.

## 7) Acceptance matrix

- Пациент отметил все пункты этапа без врача -> этап не `completed`.
- Пациент завершил все тесты этапа -> этап не `completed`.
- Врач нажал «Завершить этап» -> этап `completed`, следующий `locked` этап стал `available`.
- Пациентская вкладка План не теряет активную программу из-за автозакрытия этапа.

## 8) Definition of Done

- Удалена runtime-логика автозавершения этапа пациентом.
- Все обновленные тесты по `progress-service` и модулю `treatment-program` зелёные.
- Канонические docs в `docs/ARCHITECTURE` синхронизированы с новой FSM.
- Execution log в docs заполнен по шагам.
- Есть согласованный repair-runbook для уже ошибочно закрытых этапов.
- Финальный барьер перед merge: один прогон `pnpm run ci` успешен.
