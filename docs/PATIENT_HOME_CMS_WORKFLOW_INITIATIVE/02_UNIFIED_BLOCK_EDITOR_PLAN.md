# 02 - UNIFIED BLOCK EDITOR PLAN

## Goal

Свести текущие разрозненные модалки (add/edit/repair) к одному понятному "Настроить блок" workflow.

## Scope

Implement a unified editor entrypoint per block:

- one launch action from block card;
- section: block status + visibility;
- section: patient preview summary;
- section: items list (reorder, hide/show, delete, repair);
- section: candidate picker with type grouping.

## Mandatory Behavior To Keep

- add item;
- reorder items;
- toggle item visibility;
- delete item;
- repair unresolved targets.

## Candidate Files

New:

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorItems.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus.tsx`

Modify:

- `PatientHomeBlockSettingsCard.tsx`
- `PatientHomeBlockItemsDialog.tsx`
- `PatientHomeRepairTargetsDialog.tsx`
- `actions.ts`

Removed / folded (no separate file; add flow lives in unified dialog):

- ~~`PatientHomeAddItemDialog.tsx`~~ — секция «Добавить» и picker кандидатов внутри `PatientHomeBlockEditorDialog.tsx` (Phase 2).

## Design Constraints

- Avoid nested modal stacks where possible.
- Dialog must be usable on smaller laptop heights (scrollable body).
- Preview remains non-clickable.
- Admin UI clarity is preferred over visual polish.

## Out Of Scope

- No DB schema changes.
- No inline-create yet (Phase 3).
- No slug rename flow yet (Phase 4).
- No patient runtime visual/style changes.

## Documentation Artifacts

- update `LOG.md`
- optional notes in `BLOCK_EDITOR_CONTRACT.md` if interaction model changes

## Phase Checklist

- [x] One clear user-facing entrypoint `Настроить` exists per block.
- [x] All previous block item operations preserved.
- [x] Candidate picker supports grouped target types for mixed blocks.
- [x] Repair flow still available for unresolved refs.
- [x] Tests updated for new interaction model.
- [x] `LOG.md` updated.

## Test Gate (phase-level)

```bash
pnpm --dir apps/webapp exec vitest run <changed tests>
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

No full root CI here.

## Completion Criteria

- Editor can perform all block operations from one coherent flow.
- No runtime data-model regressions.

