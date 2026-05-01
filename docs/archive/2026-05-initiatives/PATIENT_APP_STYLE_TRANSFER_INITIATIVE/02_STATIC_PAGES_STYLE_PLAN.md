# Phase 2 — Static Pages Style Pass

## Goal

Apply shared patient style primitives to lower-risk static/read-only patient pages.

Do not change content, route structure, links, item ordering, page hierarchy, or data fetching.

## Scope

Candidate pages/components:

- `sections/page.tsx`
- `sections/[slug]/page.tsx`
- `content/[slug]/page.tsx`
- `content/[slug]/PatientContentPracticeComplete.tsx`
- `courses/page.tsx`
- `courses/PatientCoursesCatalogClient.tsx`
- `treatment-programs/page.tsx`
- `treatment-programs/[instanceId]/page.tsx`
- `treatment-programs/PatientTreatmentProgramDetailClient.tsx`

## Allowed Changes

- Replace local card classes with patient card primitives.
- Replace local CTA classes with patient action primitives.
- Replace muted/body text classes with patient text primitives.
- Adjust spacing only within current layout.
- Keep existing labels/copy exactly.
- Keep existing links and handlers exactly.

## Forbidden

- No new course/program content.
- No copy rewrite.
- No route or link target changes.
- No enrollment/treatment logic changes.
- No new data fetches.
- No CMS behavior changes.

## Checklist

- [ ] Content section cards use patient card chrome.
- [ ] Content article CTA surfaces use patient chrome.
- [ ] Course cards use patient chrome.
- [ ] Treatment program list/detail cards use patient chrome.
- [ ] Markdown content remains readable.
- [ ] Existing empty states keep same text.
- [ ] Existing tests updated only if needed.
- [ ] Product/content gaps logged, not fixed.
- [ ] `LOG.md` updated.

## Checks

Run only relevant targeted tests. Examples:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/sections/[slug]/page.subscription.test.tsx src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx
pnpm --dir apps/webapp exec eslint <changed-files>
```

Run typecheck if shared props/exports changed:

```bash
pnpm --dir apps/webapp typecheck
```

## Acceptance

- Phase 2 pages visually use patient chrome.
- No content/business behavior changed.
- Audit has no mandatory style-only violations.
