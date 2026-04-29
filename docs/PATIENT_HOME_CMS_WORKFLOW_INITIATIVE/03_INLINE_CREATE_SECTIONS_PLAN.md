# 03 - INLINE CREATE SECTIONS PLAN

## Goal

Позволить из настройки блока, работающего с `content_section`, сразу создать недостающий раздел и автоматически добавить его в блок.

## Scope

1. Add server action `createContentSectionForPatientHomeBlock`.
2. Validate:
   - doctor/admin access;
   - block supports `content_section`;
   - valid title/slug;
   - media URL policy;
   - slug uniqueness.
3. Create section through existing content sections port/service.
4. Add new section as `patient_home_block_item`.
5. Keep user in current block editor context.

## Candidate Files

- `apps/webapp/src/app/app/settings/patient-home/actions.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm.tsx` (new)
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
- related RTL tests for inline form/editor

## Behavior Requirements

- For `situations` empty candidates: show CTA "Создать раздел".
- Inline form fields:
  - `title` (required)
  - `slug` (auto + manual)
  - `description`
  - `iconImageUrl`
  - `coverImageUrl`
  - `requiresAuth`
  - `isVisible`
- On success:
  - new section created;
  - item added to current block;
  - UI refreshed without losing context.

## Out Of Scope

- No inline-create for content pages/courses yet.
- No slug rename flow yet.
- No patient runtime style changes.

## Documentation Artifacts

- update `LOG.md` with action contract and edge cases.
- if needed, extend `BLOCK_EDITOR_CONTRACT.md` with inline-create status.

## Phase Checklist

- [x] Server action implemented with strict validation.
- [x] UI inline form integrated into block editor.
- [x] Successful create auto-adds item.
- [x] Duplicate/invalid slug failures handled.
- [x] Media URL policy reused.
- [x] Tests for action + UI added/updated.
- [x] `LOG.md` updated.

## Test Gate (phase-level)

```bash
pnpm --dir apps/webapp exec vitest run <changed tests>
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

No full root CI here.

## Completion Criteria

- Editor can fill empty `situations` from one place.
- No schema changes and no runtime regressions.

