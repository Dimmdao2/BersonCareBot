# STAGE A4 PLAN — `program_action_log` + чек-лист дня + inbox «К проверке»

## 1. Цель этапа

Ввести единый журнал действий пациента по программе (`program_action_log`), построить чек-лист выполнения и добавить врачу в карточке пациента секцию «Тесты, ожидающие оценки».

Источник требований: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.5, §2.3-§2.5, §4.3, §6 A4).

## 2. Hard gates before coding

- O2 fixed for this initiative: LFK logging granularity in MVP = complex-level.
- O3 fixed for this initiative: post-session note writes to `program_action_log.note`; `lfk_session.note` is not added in A4.
- A2 should be done because checklist depends on actionable/persistent/disabled semantics.
- A3 is recommended before A4 if checklist UI should respect groups. If A3 not done, render flat list and log the decision.

## 3. In scope / out of scope

### In scope

- Drizzle table `program_action_log`.
- Service method to write/read actions.
- Patient checklist toggles.
- Simplified post-session form.
- Marker for test submission in action log.
- Doctor card inbox «К проверке».

### Out of scope

- Cross-patient inbox in doctor Today.
- Full analytics dashboard.
- Separate pain scale.
- Per-exercise log inside complex (вынесено в backlog после A4).

## 4. Allowed files / likely files

Likely:

- `apps/webapp/db/schema/**`
- `apps/webapp/src/modules/treatment-program/**`
- `apps/webapp/src/modules/tests/**`
- `apps/webapp/src/infra/repos/*TreatmentProgram*`
- `apps/webapp/src/infra/repos/*Test*`
- `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/**`
- `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/test-results/route.ts`
- `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/test-results/**`
- `apps/webapp/src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts`
- patient plan/run-screen files under `apps/webapp/src/app/app/patient/treatment-programs/**`
- doctor client card files under `apps/webapp/src/app/app/doctor/clients/**`

Do not edit:

- cross-patient doctor Today dashboard, unless only adding an explicit TODO/backlog note.
- notification/bot/integrator code.
- courses.

## 5. Composer-Safe UI contract

### Patient checklist

Use:

- `patientSectionSurfaceClass` for checklist container.
- `patientListItemClass` for each item row.
- `patientSectionTitleClass` for section title.
- `patientMutedTextClass` for item meta.
- `Button` from `@/components/ui/button` or existing patient action class for primary submit.

Checkbox/toggle:

- If existing patient checkbox component exists, reuse it.
- If not, use native `<input type="checkbox">` with label, but wrap row in `patientListItemClass`.
- Do not create custom fake checkbox div.

Required row structure:

```tsx
<label className={patientListItemClass}>
  <input type="checkbox" className="h-4 w-4" />
  <span className="min-w-0 flex-1">...</span>
</label>
```

### Post-session form

Use:

- `Select` for difficulty (`easy`, `medium`, `hard`) or 3 `Button` variants if route already uses button toggles.
- `Textarea` for optional note.
- `Button` for submit.
- Surface: `patientFormSurfaceClass` or `patientSectionSurfaceClass`.

Labels:

- `Как прошло занятие?`
- `Заметка для врача`
- submit: `Сохранить`

Forbidden:

- pain scale in A4;
- per-exercise comment fields;
- raw modal implementation.

### Doctor inbox

Use:

- Existing patient card section style if present.
- Otherwise doctor UI primitives: `Card`, `Badge`, `Button`.
- Status badge label: `К проверке`.
- Link/button label: `Открыть тест`.

Forbidden:

- New global inbox page.
- Polling/auto-refresh.

## 6. Atomic implementation plan

### A4.1 Schema

- [ ] Add `program_action_log` table.
- [ ] Fields: `id`, `instance_id`, `instance_stage_item_id`, `patient_user_id`, `session_id`, `action_type`, `quantity/payload JSONB NULL`, `note TEXT NULL`, `created_at`.
- [ ] Index `instance_id`.
- [ ] Index `instance_stage_item_id`.
- [ ] Index `created_at`.

### A4.2 Domain/service

- [ ] Add action types: `done`, `viewed`, `note`.
- [ ] Add write method with idempotency for checkbox toggles (avoid duplicate `done` spam for same day/session if product expects one).
- [ ] Add read method for checklist state.
- [ ] Add read method for doctor pending test evaluations.

### A4.3 Patient checklist

- [ ] Build list from current available stage.
- [ ] Exclude disabled items.
- [ ] Exclude persistent recommendations.
- [ ] Include actionable recommendations and LFK/test items.
- [ ] Render flat or grouped based on A3 availability.
- [ ] Toggle writes action log and updates UI state.

### A4.4 LFK run-screen/session form

- [ ] On finish, create/close `session_id`.
- [ ] Save difficulty: `easy|medium|hard`.
- [ ] Save optional note to `program_action_log.note`.
- [ ] Do not add pain field.

### A4.5 Test run-screen marker

- [ ] Existing test attempt/result remains source of test details.
- [ ] Add action log marker when patient submits test.
- [ ] Do not duplicate test result payload in action log.

### A4.6 Doctor inbox

- [ ] Query active patient programs for tests with `test_results.decided_by IS NULL`.
- [ ] Render section in patient card.
- [ ] Each row: test title, submitted date, program/stage label if available, `Открыть тест`.
- [ ] Empty state: `Нет тестов, ожидающих оценки`.

### A4.7 Tests

- [ ] Service: write/read action.
- [ ] Service: checklist excludes disabled/persistent.
- [ ] Service: pending tests query.
- [ ] Patient UI: checkbox writes and reflects state.
- [ ] Doctor UI: inbox shows pending and hides decided.

## 7. Required checks

```bash
rg "program_action_log|session_id|action_type|decided_by|К проверке|Как прошло занятие" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

## 8. Rollback notes

- Table is additive. Code can stop writing/reading action log if rollback needed.
- Do not remove existing `test_attempts`/`test_results` paths.
- If note storage decision changes, migrate note data explicitly.

## 9. Definition of Done

- Action log writes patient actions.
- Checklist works and respects disabled/persistent.
- LFK completion form saves difficulty + optional note.
- Test submission creates marker, details remain in test tables.
- Doctor card shows pending test evaluations.
- LOG updated using `LOG_TEMPLATE.md`.
