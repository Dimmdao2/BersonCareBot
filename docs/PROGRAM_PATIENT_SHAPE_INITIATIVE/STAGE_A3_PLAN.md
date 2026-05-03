# STAGE A3 PLAN — `tplStageGroups` / `instStageGroups`

## 1. Цель этапа

Добавить смысловые группы внутри этапа как отдельные таблицы template+instance:

- `treatment_program_template_stage_groups` (`tplStageGroups`)
- `treatment_program_instance_stage_groups` (`instStageGroups`)

и связать stage items с группами через nullable `group_id`.

Источник требований: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.1, §3.1, §6 A3).

## 2. Hard gates before coding

- A1 should be done or consciously skipped. If B6 visual constructor pass is not done, keep A3 UI minimal.
- Do not introduce a drag-and-drop dependency in A3. Use explicit move buttons first.
- Keep `group_id NULL` valid forever: items can be outside group.

## 3. In scope / out of scope

### In scope

- Two new Drizzle tables.
- `group_id` on template and instance stage items.
- Copy template->instance with group id mapping.
- Doctor CRUD/reorder/move UI.
- Patient grouped rendering.

### Out of scope

- Structured calendar/schedule by weekday/time.
- New FSM statuses.
- `program_action_log` — A4.
- Drag-and-drop library.

## 4. Allowed files / likely files

Likely:

- `apps/webapp/db/schema/**`
- `apps/webapp/src/modules/treatment-program/**`
- `apps/webapp/src/infra/repos/*TreatmentProgram*`
- `apps/webapp/src/app/api/doctor/treatment-program-templates/[id]/stages/**`
- `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/stages/**`
- `apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`
- patient plan render files under `apps/webapp/src/app/app/patient/treatment-programs/**`
- tests beside these files.

Do not edit:

- unrelated catalogs;
- `COURSES_INITIATIVE` code;
- `lfk` tables listed as protected in treatment program execution rules.

## 5. Composer-Safe UI contract

### Doctor UI

Use:

- `Button` for add/delete/move actions.
- `Input` for group `title`.
- `Textarea` for group `description` and `schedule_text`.
- `Dialog` for group creation/edit if inline editing becomes noisy.
- `ChevronUp`, `ChevronDown`, `Trash2` icons only if existing file already uses lucide pattern.

Required group card classes:

- wrapper: `rounded-md border border-border/60 bg-card p-3`
- header: `flex items-start justify-between gap-3`
- controls row: `flex flex-wrap items-center gap-2`
- item list inside group: `mt-3 flex flex-col gap-2`

Move controls:

- `Вверх`
- `Вниз`
- `В группу`
- `Без группы`

Forbidden:

- New drag-and-drop package.
- Raw `<button>`.
- Hidden magic reorder on click without visible buttons.
- Deleting items when deleting group. On group delete, move items to `group_id=NULL`.

### Patient UI

There is no shared Accordion component in `components/ui`. Use one of:

1. Existing project accordion/collapsible if found by `rg`.
2. Native `<details>` / `<summary>` with patient classes.

Recommended patient group markup:

```tsx
<details className={patientCardCompactClass} open>
  <summary className="cursor-pointer list-none">
    <span className={patientSectionTitleClass}>...</span>
    <span className={patientMutedTextClass}>...</span>
  </summary>
  <div className="mt-3 flex flex-col gap-2">...</div>
</details>
```

Use:

- `patientCardCompactClass`
- `patientListItemClass`
- `patientSectionTitleClass`
- `patientMutedTextClass`

Do not use home-only styles.

## 6. Atomic implementation plan

### A3.1 Schema

- [x] Add template stage groups table: `id`, `stage_id`, `title`, `description NULL`, `schedule_text NULL`, `sort_order`, timestamps if local pattern uses them.
- [x] Add instance stage groups table: same fields + `source_group_id NULL`, optional `snapshot JSONB` if current copy pattern uses snapshots.
- [x] Add `group_id UUID NULL` to template stage items.
- [x] Add `group_id UUID NULL` to instance stage items.
- [x] Add indexes by `stage_id`, `sort_order`.
- [x] Keep foreign keys consistent with Drizzle project conventions.

### A3.2 Types/ports/repos

- [x] Add `TemplateStageGroup` and `InstanceStageGroup` types.
- [x] Extend stage detail read model to include `groups`.
- [x] Extend item read model with `groupId`.
- [x] Add repo methods for CRUD/reorder groups.

### A3.3 Copy service

- [x] Copy template groups first.
- [x] Build `oldTemplateGroupId -> newInstanceGroupId` map.
- [x] Copy items and translate `group_id`.
- [x] Preserve `NULL` group ids.

### A3.4 Doctor UI

- [x] Render ungrouped items section: `Без группы`.
- [x] Render groups sorted by `sort_order`.
- [x] Add group button.
- [x] Edit group title/description/schedule.
- [x] Move group up/down.
- [x] Move item between groups via explicit select/dialog/buttons.
- [x] Delete group moves items to `NULL`, does not delete items.

### A3.5 Patient UI

- [x] Current stage renders group sections.
- [x] `schedule_text` appears in group summary as muted text.
- [x] Ungrouped items render after groups under `Без группы` or as plain list (choose one and log).
- [x] Empty groups are hidden for patient unless product decides otherwise.

### A3.6 Tests

- [x] Copy service preserves group structure.
- [x] Group delete does not delete items.
- [x] Item can move group -> group and group -> null.
- [x] Patient render handles grouped, ungrouped, no groups.

## 7. Required checks

```bash
rg "StageGroup|stage_groups|tplStageGroups|instStageGroups|group_id|schedule_text" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

## 8. Rollback notes

- `group_id NULL` allows ignoring groups in code if rollback needed.
- Do not make item visibility depend on group existence.
- If group copy fails, fail whole assignment transaction rather than partially copying.

## 9. Definition of Done

- Groups exist on template and instance.
- Items can be grouped or ungrouped.
- Copy preserves group structure.
- Doctor can create/edit/reorder/delete groups safely.
- Patient sees grouped stage without home-specific UI.
- LOG updated using `LOG_TEMPLATE.md`.
