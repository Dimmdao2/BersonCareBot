# AUDIT_STAGE_B — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

Дата аудита: 2026-05-05  
Аудитор: Codex 5.3

## Итог

Stage B (`§1.1a detail MVP`) проходит аудит: **PASS**.  
Critical / Major / Minor обязательных пробелов не обнаружено.

## Проверка по пунктам

### 1) Detail соответствует `STAGE_B.md` и `ROADMAP_2` §1.1a

**Статус:** PASS

- Реализация в `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` соответствует целям `STAGE_B.md` (B1..B6) и требованиям `ROADMAP_2` §1.1a:
  - верхний блок detail с названием, текущим этапом, CTA и ссылкой архива;
  - отдельный блок stage 0;
  - текущий этап как основной рабочий блок;
  - архив в `details`;
  - сигнал «План обновлён»;
  - расчёт expected control date от `startedAt + expectedDurationDays`.

### 2) Этап 0 отделён от текущего этапа

**Статус:** PASS

- Используется разделение `splitPatientProgramStagesForDetailUi(...)` на `stageZeroStages`, `archiveStages`, `pipeline`.
- `stageZeroStages` рендерятся отдельной секцией с заголовком `Общие рекомендации`.
- `currentWorkingStage` рендерится отдельно как текущий этап.

### 3) Архив этапов под `<details>` и скрыт по умолчанию

**Статус:** PASS

- Архив рендерится в `<details id="program-archive">...`.
- Атрибут `open` отсутствует, значит по умолчанию секция свернута.

### 4) Нет "чек-листа на сегодня" и процентной аналитики

**Статус:** PASS

- В UI detail нет блока/заголовка `"Чек-лист на сегодня"` (это дополнительно проверено тестом `does not show removed checklist section (1.1a)`).
- В компоненте отсутствуют процентные метрики прогресса (`% этапа`, `% программы`, etc.) — только статусы и факты выполнения элементов.

### 5) Дата контроля считается от `started_at + expected_duration_days`

**Статус:** PASS

- В `PatientTreatmentProgramDetailClient.tsx`:
  - `controlIso = expectedStageControlDateIso(currentWorkingStage)`;
  - `controlLabel` форматируется для UI.
- В `apps/webapp/src/modules/treatment-program/stage-semantics.ts`:
  - `expectedStageControlDateIso(...)` возвращает дату только при наличии обоих полей (`startedAt` и `expectedDurationDays`) и добавляет `days` к `startedAt`.

### 6) `PatientTreatmentProgramDetailClient.test.tsx` зелёный

**Статус:** PASS

- Выполнено:
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx`
- Результат: passed.

### 7) `[instanceId]/page.nudgeResilience.test.tsx` зелёный

**Статус:** PASS

- Выполнено:
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs/[instanceId]/page.nudgeResilience.test.tsx`
- Результат: passed.

## MANDATORY FIX INSTRUCTIONS

### Critical

- **None.** Обязательных critical-фиксов по результатам аудита нет.

### Major

- **None.** Обязательных major-фиксов по результатам аудита нет.

### Minor

- **None.** Обязательных minor-фиксов по результатам аудита нет.
