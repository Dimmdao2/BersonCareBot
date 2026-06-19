# Code Audit 2 — QW-A3 — Architecture & Edge Cases
- auditor: audit2-qw-a3b
- date: 2026-06-19

## Clauses

| # | Clause | Status | Notes |
|---|--------|--------|-------|
| B1 | PatientInstanceStageItemCard uses `@/shared/ui/patient/*` primitives (not doctor) | PASS | Imports: `Button`/`buttonVariants` from `@/shared/ui/patient/primitives/button`; `PatientCatalogMediaStaticThumb`, `patientMutedTextClass`, `patientPillClass` all from `@/shared/ui/patient/*`. No doctor-layer imports. |
| B2 | `PatientProgramItemExecutionRow` `variant="tile"` is a valid prop value | PASS | Component at `PatientProgramItemExecutionRow.tsx` line 53 declares `variant?: "tile" \| "itemPage"` with default `"tile"`. Both "tile" usage sites in the codebase match. |
| B3 | `lastDoneAtIsoByItemId` is actually wired from `PatientInstanceStageBody` to `PatientInstanceStageItemCard` | FAIL | `PatientInstanceStageBody` has **no `lastDoneAtIsoByItemId` prop at all** (neither in its interface nor destructured). Both `PatientInstanceStageItemCard` usages inside `PatientInstanceStageBody` (grouped items line 132, ungrouped items line 170) omit the prop entirely. The card component therefore always receives `lastDoneAtIsoByItemId === undefined`, so `lastDoneAtIsoByItemId?.[item.id]` always yields `undefined` → `lastIso` passed to `PatientProgramItemExecutionRow` is always `null`. The execution dots render but will always show "not done today" / empty state even when the user has done it today. This is a **data wiring gap**. (Note: `PatientTreatmentProgramStagePageProgramSection` — the *other* program surface — does wire `lastDoneAtIsoByItemId` correctly; the gap is only in the `PatientInstanceStageBody` path.) |
| B4 | Icon row inside `{item.itemType !== "recommendation" ? (...) : null}` guard | PASS | Lines 279–302 in `PatientInstanceStageItemCard.tsx` confirm the icon row is correctly gated on `item.itemType !== "recommendation"`. |
| B5 | `lastDoneAtIsoByItemId?.[item.id]` safe when prop is undefined | PASS | Optional-chaining `lastDoneAtIsoByItemId?.[item.id]` at line 295 is safe: `undefined?.[key] === undefined`. No runtime crash possible. |
| B6 | `item.snapshot as Record<string, unknown>` cast for `.contraindications` is sound | PASS | The contraindications check at line 290 is `Boolean((item.snapshot as Record<string, unknown>)?.contraindications)`. The cast is a widening cast (snapshot is already a typed object), and the optional chain makes it safe if the key is absent. Exercise snapshots do carry a `contraindications` field (`lfk-exercises/types.ts` lines 34, 71, 83). The `Boolean(...)` coercion handles `null`, `""`, and `undefined` gracefully (all falsy → icon suppressed). Sound. |
| B7 | Other callers of `PatientInstanceStageItemCard` that may miss new optional props | PASS | Only one other render site exists: `PatientInstanceStageBody` (both grouped and ungrouped). Both new QW-A3 props (`discussionSummary`, `appDisplayTimeZone`) are optional (`?`) in the card interface, so omitting them causes no TypeScript error and results in safe defaults (badge hidden, execution dots hidden). |
| B8 | `variant="tile"` consistent across codebase | PASS | Two usage sites of `PatientProgramItemExecutionRow variant="tile"`: `PatientTreatmentProgramStagePageProgramSection.tsx:406` and `PatientInstanceStageItemCard.tsx:298`. Both match the declared union type. Consistent. |

## Additional Finding

**B3-ADDENDUM — `appDisplayTimeZone` missing from ungrouped items in `PatientInstanceStageBody`**

In `PatientInstanceStageBody.tsx`, `appDisplayTimeZone` is passed to the **grouped** items `PatientInstanceStageItemCard` (line 156) but is **omitted** from the **ungrouped** items block (lines 170–195). Execution dots will not render for ungrouped items in this surface even when timezone is provided from the parent.

This is a sibling bug to B3: both gaps affect the `PatientInstanceStageBody` path only (the readOnly/stage-archive surface), not the primary program surface (`PatientTreatmentProgramStagePageProgramSection`).

## OVERALL: FAIL

Reason: B3 is a confirmed wiring failure. `PatientInstanceStageBody` never passes `lastDoneAtIsoByItemId` to `PatientInstanceStageItemCard`, so the execution dots feature introduced by QW-A3 always displays stale (null) last-done data on the stage-archive / readOnly surface that uses `PatientInstanceStageBody`. Additionally, `appDisplayTimeZone` is inconsistently omitted from ungrouped items in the same component, causing execution dots to be suppressed entirely for those items. Both gaps are contained to the `PatientInstanceStageBody` render path; the primary program surface is unaffected.
