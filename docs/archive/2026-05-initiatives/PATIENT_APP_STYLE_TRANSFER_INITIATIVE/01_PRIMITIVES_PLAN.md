# Phase 1 — Shared Patient Style Primitives

## Goal

Prepare patient-scoped style primitives so page phases do not copy classes from the home screen.

## Scope

Allowed files:

- `apps/webapp/src/shared/ui/patientVisual.ts`
- optional `apps/webapp/src/shared/ui/patientPrimitives.ts`
- tests for new primitives if they are components
- `LOG.md`

Allowed changes:

- add class constants / small patient-only components;
- add aliases for existing home-compatible styles if needed;
- keep existing exports backwards compatible.

Forbidden:

- no page restyling yet;
- no `buttonVariants` global changes;
- no shadcn `Card` global changes;
- no content/copy/page structure changes.

## Primitive Checklist

- [ ] Card base.
- [ ] Card compact.
- [ ] List item/card.
- [ ] Form surface.
- [ ] Section surface.
- [ ] Section title.
- [ ] Body/muted text.
- [ ] Empty state.
- [ ] Pill/badge.
- [ ] Primary action.
- [ ] Secondary action.
- [ ] Danger action.
- [ ] Inline link.

## Compatibility Checklist

- [ ] Existing `patientVisual.ts` exports preserved.
- [ ] Existing home imports still compile.
- [ ] No fixed home heights/grid exported as general primitive.
- [ ] New names are semantic, no `v2/new/tmp`.
- [ ] Uses patient CSS variables where available.
- [ ] No doctor/admin imports changed.

## Checks

Run if TS changed:

```bash
pnpm --dir apps/webapp typecheck
```

Run lint on changed files:

```bash
pnpm --dir apps/webapp exec eslint src/shared/ui/patientVisual.ts
```

If a new test is added:

```bash
pnpm --dir apps/webapp exec vitest run <test-file>
```

## Acceptance

- Later phases can import patient-wide style classes without importing from `home/`.
- No page visuals were changed except unavoidable compatibility.
- Audit confirms style-only scope.
