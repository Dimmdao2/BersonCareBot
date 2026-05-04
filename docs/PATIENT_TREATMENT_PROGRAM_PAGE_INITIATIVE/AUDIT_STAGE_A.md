# AUDIT_STAGE_A — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

Дата аудита: 2026-05-05  
Аудитор: Codex 5.3

## Итог

Stage A по `started_at` проходит аудит: **PASS**.  
Критических/мажорных/минорных пробелов по заявленным 6 пунктам не обнаружено.

## Проверка по пунктам

### 1) `started_at` additive и корректно в schema + migration 0043

**Статус:** PASS

- Schema: `apps/webapp/db/schema/treatmentProgramInstances.ts` содержит поле
  `startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })`
  в `treatmentProgramInstanceStages`.
- Migration: `apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql`:
  - `ALTER TABLE ... ADD COLUMN "started_at" ...` (additive);
  - backfill ограничен условиями:
    - `s.status = 'in_progress'`
    - `s.started_at IS NULL`
  - уже установленные значения не перезаписываются.

### 2) `started_at` проходит через types/repos/read-model консистентно

**Статус:** PASS

- Type: `apps/webapp/src/modules/treatment-program/types.ts`:
  - `TreatmentProgramInstanceStageRow.startedAt: string | null`.
- PG repo: `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`:
  - `mapStage` маппит `startedAt: row.startedAt ?? null`;
  - read-модель `toDetail` использует `mapStage`.
- inMemory repo: `apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts`:
  - `StageRow` использует тот же `TreatmentProgramInstanceStageRow`;
  - `buildDetail` возвращает stage с `startedAt` без потери поля.

### 3) Patch в `pgTreatmentProgramInstance` idempotent

**Статус:** PASS

- В `updateInstanceStage`:
  - `const startedAtForPatch = patch.status === "in_progress" && !stRow.startedAt ? new Date().toISOString() : undefined;`
  - в update-set поле пишется только при `startedAtForPatch !== undefined`.
- Следствие: если `started_at` уже заполнен, повторные переводы в `in_progress` не затирают значение.

### 4) `inMemoryTreatmentProgramInstance` имеет аналогичную логику

**Статус:** PASS

- В `updateInstanceStage`:
  - `const nextStartedAt = patch.status === "in_progress" && !st.startedAt ? isoNow() : st.startedAt;`
  - `startedAt` сохраняется как есть при повторных переходах.
- Логика семантически эквивалентна PG-реализации (idempotent first-set).

### 5) Contract test `pgTreatmentProgramInstance.startedAt.contract.test.ts` зелёный и покрывает map + patch семантику

**Статус:** PASS

- Файл: `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts`.
- Тест проверяет наличие в исходнике:
  - `startedAt: row.startedAt ?? null` (map);
  - `startedAtForPatch`;
  - `patch.status === "in_progress" && !stRow.startedAt` (guard);
  - условный set только при наличии значения.
- Выполнено:
  - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts`
  - результат: `1 passed`.

### 6) `progress-service.ts` не затронут (`startedAt`-логика живёт в repo)

**Статус:** PASS

- `apps/webapp/src/modules/treatment-program/progress-service.ts` не содержит прямой записи `startedAt`.
- Сервис переводит этапы через `instances.updateInstanceStage(...)`, а установка `startedAt` инкапсулирована в репозитории (`pg`/`inMemory`), как и требуется для Stage A.

## MANDATORY FIX INSTRUCTIONS

### Critical

- **None.** Обязательных critical-фиксов по результатам аудита нет.

### Major

- **None.** Обязательных major-фиксов по результатам аудита нет.

### Minor

- **None.** Обязательных minor-фиксов по результатам аудита нет.
