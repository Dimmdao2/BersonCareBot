# STAGE A2 PLAN — actionable/persistent рекомендации + Этап 0 + disable

## 1. Цель этапа

Реализовать:

- `is_actionable` для рекомендаций в `instance_stage_item`;
- `status = active|disabled` вместо удаления item в инстансе;
- особый Этап 0 «Общие рекомендации» (`sort_order=0`, всегда видим, без FSM-логики).

Источник требований: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.2, §1.4, §1.8, §3.3, §3.4, §6 A2).

## 2. Hard gates before coding

- O4 fixed for this initiative: `is_actionable` lives only on `instance_stage_item`.
- Do not add `default_is_actionable` to recommendation catalog in A2.
- If B4 recommendation catalog rework is not done, do not redesign recommendation catalog in A2. Add only the minimum instance-level controls.
- Confirm current stage/item table names before migration with `rg "stage_items|treatment_program_.*items" apps/webapp/db apps/webapp/src`.

## 3. In scope / out of scope

### In scope

- Additive Drizzle columns on instance stage item.
- Progress/completion logic.
- Stage 0 semantics.
- Doctor controls for actionable/persistent and disable/enable.
- Patient visibility rules.
- `treatment_program_events` entries for item status changes.

### Out of scope

- Stage groups — A3.
- `program_action_log` — A4.
- Badges — A5.
- Recommendation catalog fields (`kind/body_region/quantity/frequency/duration`) — B4.

## 4. Allowed files / likely files

Likely:

- `apps/webapp/db/schema/**`
- `apps/webapp/src/modules/treatment-program/**`
- `apps/webapp/src/infra/repos/*TreatmentProgram*`
- `apps/webapp/src/app/api/doctor/treatment-program-instances/**`
- `apps/webapp/src/app/api/patient/treatment-program-instances/**`
- `apps/webapp/src/app/app/doctor/treatment-program-templates/**`
- patient plan render files under `apps/webapp/src/app/app/patient/treatment-programs/**`
- treatment program tests.

Do not edit:

- `apps/webapp/src/app/app/doctor/recommendations/**` except for compile-only type alignment.
- `apps/webapp/src/app/app/doctor/lfk-templates/**`.
- Courses.

## 5. Composer-Safe UI contract

### Doctor UI

Use:

- `Button` for enable/disable actions.
- `Select` for actionable mode if there are more than two explicit states:
  - `actionable` label: `Требует выполнения`
  - `persistent` label: `Постоянная рекомендация`
- `Badge` for item status:
  - active: `Активно`
  - disabled: `Отключено`
- `Dialog` for confirmation when disabling an item that already has activity/history.

Required classes:

- item action row: `flex flex-wrap items-center gap-2`
- muted explanation: `text-xs text-muted-foreground`
- disabled item wrapper: `opacity-60`

Forbidden:

- Trash icon semantics for instance item removal. Use eye/disable semantics or explicit `Отключить`.
- Hard delete endpoint for instance item.
- Raw confirm `window.confirm`; use `Dialog`.

### Patient UI

Use:

- `patientSectionSurfaceClass` for Stage 0 surface.
- `patientSectionTitleClass` for `Общие рекомендации`.
- `patientListItemClass` for recommendation rows.
- `patientPillClass` for `Постоянная рекомендация` if needed.
- `patientMutedTextClass` for explanatory text.

Rules:

- Persistent recommendation has no checkbox.
- Actionable recommendation can have checkbox later in A4; in A2 only render as completable marker if existing completion UI supports it.
- Disabled items are not rendered in default patient list.

## 6. Atomic implementation plan

### A2.1 Schema

- [ ] Add `is_actionable BOOLEAN NULL` to instance stage items table.
- [ ] Add `status TEXT NOT NULL DEFAULT 'active'`.
- [ ] Add safe check/enum if current schema pattern uses text enums.
- [ ] Backfill existing rows with `status='active'`.

### A2.2 Domain model

- [ ] Add `InstanceStageItemStatus = "active" | "disabled"`.
- [ ] Add helper `isCompletableItem(item)`.
- [ ] Add helper `isStageZero(stage)`.
- [ ] Add helper `isPersistentRecommendation(item)`.

### A2.3 Progress service

- [ ] Exclude `status='disabled'`.
- [ ] Exclude Stage 0 from stage FSM.
- [ ] Exclude persistent recommendations from completion.
- [ ] Keep actionable recommendations completable.

### A2.4 Mutations/events

- [ ] Add service method `disableInstanceStageItem`.
- [ ] Add service method `enableInstanceStageItem`.
- [ ] Write `treatment_program_events` with `item_disabled` / `item_enabled`.
- [ ] Do not physically delete instance items.

### A2.5 Doctor UI

- [ ] Show actionable mode control only for `item_type='recommendation'`.
- [ ] Show disable/enable action for all instance items.
- [ ] Use confirmation dialog if item has logs/history.
- [ ] Preserve existing template hard-delete behavior only for template, not instance.

### A2.6 Patient UI

- [ ] Render Stage 0 before current stage.
- [ ] Stage 0 visible even if program completed.
- [ ] Hide disabled items.
- [ ] Persistent recommendations visible without checkbox.

### A2.7 Tests

- [ ] Progress excludes disabled.
- [ ] Progress excludes persistent recommendations.
- [ ] Stage 0 never locks/completes through FSM.
- [ ] Disable then enable restores visibility.
- [ ] Events are written.

## 7. Required checks

```bash
rg "is_actionable|disabled|item_disabled|item_enabled|sort_order.*0|Stage 0|Общие рекомендации" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

## 8. Rollback notes

- Columns are additive. If rollback needed, code can ignore `is_actionable/status`.
- Never delete historical instance items as rollback.
- If event writing fails, mutation should fail atomically or document compensating behavior.

## 9. Definition of Done

- `is_actionable` and `status` work end-to-end.
- Stage 0 always visible and excluded from FSM.
- Instance item disable/enable works without hard delete.
- Completion handles actionable/persistent/disabled correctly.
- LOG updated using `LOG_TEMPLATE.md`.
