# Audit — Mechanical Visual Contract (patient home)

**Scope:** post-step review of the «Tighten patient home visual primitives» change set (shared contracts in `patientHomeCardStyles.ts` / `patientVisual.ts`, clamp + fixed sizing on subscription / courses / plan / reminder, removal of `linkedObjectType` from home reminder UI).

**Verdict: PASS**

---

## Fix follow-up (2026-04-30)

| Finding | Resolution |
|---------|------------|
| **1 — Short vs tall pixel semantics** | Retuned `patientHomeSecondaryCardShortHeightClass` and `patientHomeSecondaryCardTallHeightClass` in `patientHomeCardStyles.ts` so **tall ≥ short** at every breakpoint (`176/184/188` vs `192/200/208`). JSDoc clarifies reminder vs plan. |
| **2 — Subscription test + `className` regex** | Each carousel `Link` has `data-testid="patient-home-subscription-carousel-item"`. Test asserts two items via `querySelectorAll` instead of matching `min-w-[280px]` in `className`. |
| **3 — Hero/booking slot exports unused** | No code change (per original audit: intentional forward contract for a later layout pass). |
| **4 — `patientLineClamp3Class` unused** | `patientLineClamp3Class` is now composed into `patientHomeCardSubtitleClampXs3Class`; **courses** row subtitle uses that export so the primitive is wired through the shared style module. |

**Verification:** targeted Vitest — `PatientHomeSubscriptionCarousel.test.tsx`, `PatientHomeNextReminderCard.test.tsx` — pass. Full root `pnpm run ci` not run for this follow-up.

---

## Findings (by severity) — historical

The items below describe the pre-fix state; see **Fix follow-up** above for resolutions.

### 1. Medium — Misleading height token names vs pixel values

| Field | Detail |
|--------|--------|
| **Where** | `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` — `patientHomeSecondaryCardShortHeightClass` vs `patientHomeSecondaryCardTallHeightClass` |
| **Evidence** | On the default (mobile-first) breakpoint, «tall» plan uses `h-[184px]` while «short» reminder uses `h-[188px]`, so **tall is shorter than short** in pixels at that breakpoint. At `lg`, both end at `h-[200px]`. |
| **Exact fix** | Either (a) retune breakpoints so `tall` is always ≥ `short` where semantically required, or (b) rename exports to neutral names (e.g. `patientHomeSecondaryCardSlotAClass` / `...SlotBClass`, or `...WithDenseFooterClass` / `...WithStackedHeaderClass`) and document which card uses which. |

### 2. Low — Test still couples to a Tailwind substring in `className`

| Field | Detail |
|--------|--------|
| **Where** | `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx` — `it("uses horizontal snap scroll and card width band")` |
| **Evidence** | `expect(card?.className).toMatch(/min-w-\[280px\]/)` depends on the merged string still containing that exact utility (implementation detail). |
| **Exact fix** | Prefer a stable contract: e.g. `data-testid="patient-home-subscription-card"` on the link and assert presence, or assert `patientHomeCarouselItemLayoutClass` via a dedicated `data-layout="subscription-carousel-item"` attribute set next to the shared constant. |

### 3. Low — Reserved slot exports not yet consumed by hero/booking components

| Field | Detail |
|--------|--------|
| **Where** | `patientHomeCardStyles.ts` — `patientHomeHeroSlotClass`, `patientHomeBookingCompanionSlotClass` |
| **Evidence** | Grep / tree: no imports from `PatientHomeDailyWarmupCard` or `PatientHomeBookingCard` in the mechanical step (by design). |
| **Exact fix** | None for this audit: intentional forward contract. Next layout pass should wire these or drop unused exports if the plan changes. |

### 4. Low — `patientLineClamp3Class` unused in repo

| Field | Detail |
|--------|--------|
| **Where** | `apps/webapp/src/shared/ui/patientVisual.ts` |
| **Evidence** | Exported for reuse; no current imports outside the file. |
| **Exact fix** | Keep as part of the shared clamp toolkit, or use in a card that needs three-line preview; optional eslint ignore only if policy requires zero-unused-exports (currently not failing targeted lint). |

---

## Checks performed

### Reusable contracts (not one-off class soup in components)

- **PASS.** `patientVisual.ts` adds shared primitives `patientLineClamp2Class` / `patientLineClamp3Class`.
- **PASS.** `patientHomeCardStyles.ts` adds named, documented exports: hero/booking **slot** bands, `patientHomeSecondaryCardShellClass` + short/tall **height** bands, carousel/course **layout** bands, `patientHomeCardMediaSlotClass`, title/subtitle **clamp** variants (including plan-specific). Clamp title classes compose `patientLineClamp2Class` from `patientVisual` (single source for `line-clamp-2 min-w-0`).
- Components import these symbols and add only local layout helpers (`min-h-0`, `flex-1`, transitions), not duplicate the full height/clamp strings.

### Subscription / courses / plan / reminder: clamp + fixed sizing, logic unchanged

- **PASS.** `PatientHomeSubscriptionCarousel`: still `if (cards.length === 0) return null`; same `heading`; same `Link` `href`/`prefetch`; resolver types unchanged.
- **PASS.** `PatientHomeCoursesRow`: same empty guard, same `cards.map` keys and links.
- **PASS.** `PatientHomePlanCard`: same null guard, same `routePaths.patientTreatmentProgram(instance.id)`.
- **PASS.** `PatientHomeNextReminderCard`: same `ruleLabel` derivation, same `scheduleLabel`, same reminders link; only presentation and removal of debug-ish suffix (see below).

### `linkedObjectType` not shown on patient home UI

- **PASS.** `PatientHomeNextReminderCard.tsx` no longer renders `rule.linkedObjectType`. Fixture in `PatientHomeNextReminderCard.test.tsx` still sets `linkedObjectType` on the rule object (valid test data); no assertion expected that string in the DOM.

### Schema / repos / CMS / navigation

- **PASS (mechanical step).** The implementation commit touched only:

  - `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
  - `apps/webapp/src/shared/ui/patientVisual.ts`
  - `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx`
  - `PatientHomeCoursesRow.tsx`
  - `PatientHomePlanCard.tsx`
  - `PatientHomeNextReminderCard.tsx`

  No `db/schema`, no `infra/repos`, no CMS/settings routes, no nav components.

### Tests not brittle class snapshots

- **PASS.** Carousel width is no longer asserted via a Tailwind substring on `className`; stable `data-testid` is used (see Fix follow-up).

---

## Tests reviewed / run (this audit)

- **Reviewed:** `PatientHomeSubscriptionCarousel.test.tsx`, `PatientHomeNextReminderCard.test.tsx` — no new snapshot files; no assertion on `linkedObjectType` text.
- **Run (targeted, not full root CI):**

  ```bash
  pnpm --dir apps/webapp exec vitest run \
    src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx \
    src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx
  ```

  **Result:** `Test Files 2 passed (2)`, `Tests 5 passed (5)` (Vitest globalSetup may log migrate/DB noise; tests themselves passed).

---

## Out of scope (this document)

- No code fixes applied in the audit commit (documentation + LOG only).
- Full `pnpm run ci` not run per task constraints.
