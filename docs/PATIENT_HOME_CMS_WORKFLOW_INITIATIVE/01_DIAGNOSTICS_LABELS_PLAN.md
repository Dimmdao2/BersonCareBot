# 01 - DIAGNOSTICS AND LABELS PLAN

## Goal

Сделать текущий admin workflow понятным без смены архитектуры:

- правильные названия сущностей;
- явные объяснения empty/hidden/missing состояний;
- прозрачный статус "почему блок не виден пациенту".

## Scope

1. Add metadata helper for block editor copy:
   - labels by block;
   - item noun by block;
   - target type labels.
2. Replace generic copy in settings UI:
   - remove misleading generic "материал" where block expects section/course.
3. Improve preview diagnostics:
   - visible but empty block warning;
   - hidden block status;
   - unresolved target reason.
4. Keep all existing actions untouched functionally.

## Candidate Files

- `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts` (new)
- `apps/webapp/src/modules/patient-home/blockEditorMetadata.test.ts` (new)
- `apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
- related test files under `settings/patient-home/*.test.tsx`

## Out Of Scope

- No DB schema changes.
- No new actions with side effects.
- No patient runtime visual changes.
- No shell/nav/styles redesign.

## Required UX Outcomes

- `situations` uses "Добавить раздел".
- `courses` uses "Добавить курс".
- `subscription_carousel` uses mixed label.
- visible-empty block warns that patient runtime may hide it.
- non-item blocks explain where data comes from.

## Documentation Artifacts

- update `LOG.md`
- (optional) append notes to `BLOCK_EDITOR_CONTRACT.md` if wording changed

## Phase Checklist

- [ ] Metadata helper added with full block coverage.
- [ ] Settings copy uses metadata helper.
- [ ] Empty-state warnings implemented.
- [ ] No functional regression in existing add/edit/reorder/repair actions.
- [ ] Tests for metadata and UI copy added/updated.
- [ ] `LOG.md` updated.

## Test Gate (phase-level)

```bash
pnpm --dir apps/webapp exec vitest run <changed tests>
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

No full root CI here.

## Completion Criteria

- Editors can understand what they configure without reading code.
- No runtime behavior changes.

