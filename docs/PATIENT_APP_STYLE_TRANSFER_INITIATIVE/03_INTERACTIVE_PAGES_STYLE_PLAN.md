# Phase 3 — Interactive Pages Style Pass

## Goal

Apply patient style primitives to existing interactive patient pages while preserving current behavior and copy.

## Scope

Candidate pages/components:

- profile pages/components;
- notifications pages/components;
- reminders pages/components;
- diary pages/components;
- support/help/purchases/install/bind-phone visual wrappers.

Exact file list must come from `PLAN_INVENTORY.md`.

## Allowed Changes

- Replace card/list/form wrapper classes with patient primitives.
- Replace generic CTA/link visual classes with patient action primitives.
- Align tabs/list rows visually without changing tab keys/routes.
- Preserve existing form fields, labels, validation, server actions and handlers.
- Preserve existing loading/error text.

## Forbidden

- No form behavior changes.
- No reminder schedule behavior changes.
- No diary persistence changes.
- No auth/profile/channel preference behavior changes.
- No support destination/config changes.
- No copy rewrite.
- No new UX states invented.

## Checklist

- [ ] Profile accordion/card chrome transferred.
- [ ] Notification list/toggle chrome transferred.
- [ ] Reminder rule cards chrome transferred.
- [ ] Diary tabs chrome transferred without changing tab semantics.
- [ ] Symptom/LFK cards/forms chrome transferred.
- [ ] Utility pages surfaces transferred.
- [ ] Destructive actions remain semantically and visually distinct.
- [ ] Existing tests updated only for markup/style wrapper changes.
- [ ] Product/content gaps logged, not fixed.
- [ ] `LOG.md` updated.

## Checks

Examples; choose based on changed files:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/patient/profile/ProfileForm.test.tsx src/app/app/patient/profile/actions.surface.test.ts
pnpm --dir apps/webapp exec vitest run src/app/app/patient/reminders/actions.test.ts
pnpm --dir apps/webapp exec vitest run src/app/app/patient/diary/lfk/LfkComplexCard.test.tsx
pnpm --dir apps/webapp exec eslint <changed-files>
```

For broad interactive style pass:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

## Acceptance

- Interactive pages keep behavior and copy.
- Visual chrome is patient-aligned.
- Audit confirms no business/product scope leak.
