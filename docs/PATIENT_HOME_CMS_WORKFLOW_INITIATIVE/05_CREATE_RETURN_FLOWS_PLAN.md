# 05 - CREATE/RETURN FLOWS PLAN

## Goal

Сделать удобный путь создания недостающих материалов/курсов из настройки блоков, даже если сущность нельзя полноценно создать inline.

## Scope

1. Content pages flow:
   - either quick draft inline OR create-in-CMS with return context;
   - preserve block context and return action.
2. Courses flow:
   - create-in-course-CMS with return context;
   - avoid partial invalid course creation.
3. Mixed blocks (`subscription_carousel`) support grouped create CTAs:
   - create section;
   - create material;
   - create course.

## Candidate Files

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/actions.ts` (if helper actions needed)
- CMS content new/edit pages for `returnTo` handling
- course create/list pages for `returnTo` handling

## Behavior Requirements

- User always sees a path to create missing target from block editor.
- Return to block editor context is explicit and reliable.
- Mixed block create actions are grouped and clearly labeled.

## Out Of Scope

- No course model changes.
- No billing or subscription gating.
- No broad redesign of CMS content/course forms.

## Documentation Artifacts

- update `LOG.md` with chosen strategy (inline vs returnTo)
- update `BLOCK_EDITOR_CONTRACT.md` if create paths changed

## Phase Checklist

- [x] `content_page` create path from block editor implemented.
- [x] `course` create path from block editor implemented.
- [x] Return context preserved.
- [x] Mixed block shows grouped create actions.
- [x] Tests for context/return flow updated.
- [x] `LOG.md` updated.

## Test Gate (phase-level)

```bash
pnpm --dir apps/webapp exec vitest run <changed tests>
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

No full root CI here.

## Completion Criteria

- Editors can create or reach creation flow for every target type without losing context.

