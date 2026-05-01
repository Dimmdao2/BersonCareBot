# CHECKLISTS — Patient App Style Transfer

## 1. Style-Only Gate

Before any EXEC, confirm:

- [ ] No page content/copy change is planned.
- [ ] No section/order/tab/flow change is planned.
- [ ] No new data fetch is planned.
- [ ] No server action/API/service/repo change is planned.
- [ ] No migration/env/settings change is planned.
- [ ] Changes are limited to visual classes, patient primitives, and tests/docs needed for those changes.

If any item fails, stop and ask for product/engineering approval.

## 2. Allowed Style Operations

- [ ] Replace `rounded-xl/2xl`, `bg-card`, `shadow-sm`, `border-border` with patient primitive classes.
- [ ] Replace generic button classes with patient action classes.
- [ ] Replace generic muted text classes with patient text tone classes.
- [ ] Wrap existing content in patient surface classes without changing content.
- [ ] Adjust spacing only to match patient rhythm while preserving existing layout structure.
- [ ] Keep existing visible labels unchanged.
- [ ] Keep existing interactive handlers unchanged.

## 3. Forbidden Operations

- [ ] Do not add new blocks.
- [ ] Do not remove blocks.
- [ ] Do not reorder sections.
- [ ] Do not rewrite copy.
- [ ] Do not decide new empty-state content.
- [ ] Do not change route paths.
- [ ] Do not change data gates.
- [ ] Do not change business logic.
- [ ] Do not change doctor/admin global primitives.
- [ ] Do not import home fixed geometry into unrelated pages.

## 4. Phase Route Matrix

Phase 2 — static/read-only style pass:

- [ ] `/app/patient/sections`
- [ ] `/app/patient/sections/[slug]`
- [ ] `/app/patient/content/[slug]`
- [ ] `/app/patient/courses`
- [ ] `/app/patient/treatment-programs`
- [ ] `/app/patient/treatment-programs/[instanceId]`

Phase 3 — interactive style pass:

- [ ] `/app/patient/profile`
- [ ] `/app/patient/notifications`
- [ ] `/app/patient/reminders`
- [ ] `/app/patient/reminders/journal/[ruleId]`
- [ ] `/app/patient/diary`
- [ ] `/app/patient/diary/symptoms*`
- [ ] `/app/patient/diary/lfk*`
- [ ] `/app/patient/support`
- [ ] `/app/patient/help`
- [ ] `/app/patient/purchases`
- [ ] `/app/patient/bind-phone`

Phase 4 — booking/cabinet style pass:

- [ ] `/app/patient/booking/new*`
- [ ] patient cabinet booking components
- [ ] appointment cards/lists
- [ ] booking calendar/slot chips

## 5. Visual QA Checklist

Viewports:

- [ ] 320px: no horizontal scroll introduced.
- [ ] 360px: CTAs not clipped.
- [ ] 390px: primary mobile review width.
- [ ] 768px: tablet remains usable.
- [ ] 1024px boundary: shell/nav unaffected.
- [ ] 1280px: content width still comfortable.

States:

- [ ] empty list;
- [ ] one item;
- [ ] long title;
- [ ] disabled action;
- [ ] loading/pending;
- [ ] error/warning;
- [ ] guest/onboarding/full patient where route supports it.

## 6. Accessibility Checklist

- [ ] Interactive target sizes not reduced.
- [ ] `aria-label` preserved.
- [ ] `aria-current` preserved.
- [ ] `aria-expanded` preserved.
- [ ] form labels preserved.
- [ ] tab semantics preserved.
- [ ] focus-visible styles not clipped.
- [ ] contrast not worsened.

## 7. Test Checklist

- [ ] Update tests only when visual markup changes affect queries/assertions.
- [ ] Preserve behavior tests.
- [ ] Prefer semantic assertions over class snapshots.
- [ ] Run targeted tests for changed interactive components.
- [ ] Run `pnpm --dir apps/webapp typecheck` if shared exports/props changed.
- [ ] Run `pnpm --dir apps/webapp lint` after substantial style pass.
- [ ] Do not run root `pnpm run ci` unless requested/pre-push.

## 8. Audit Checklist

Each audit must answer:

- [ ] Was the phase style-only?
- [ ] Did content/copy/order/flow stay unchanged?
- [ ] Were business/data/API layers untouched?
- [ ] Were patient primitives reused?
- [ ] Did home-specific geometry stay out of unrelated pages?
- [ ] Was doctor/admin untouched?
- [ ] Are tests/checks appropriate?
- [ ] Are product/content gaps deferred, not invented?

## 9. Documentation Checklist

- [ ] `LOG.md` updated after EXEC/FIX.
- [ ] `AUDIT_PHASE_N.md` created after audit.
- [ ] `GLOBAL_AUDIT.md` created after global audit.
- [ ] Any intentional exception documented.
- [ ] `docs/README.md` updated to include this active initiative.
