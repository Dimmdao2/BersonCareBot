# Code Audit 1 — QW-A3 — Icon Row in Patient Item Tile
- auditor: audit1-qw-a3a (independent re-audit by Sonnet 4.6 subagent, 2026-06-19)
- date: 2026-06-19
- commit: 9ea67baa

## Clauses

| # | Clause | Status | Notes |
|---|--------|--------|-------|
| A3-01 | Old "Отметок в журнале за сегодня: N" block completely removed | PASS | No trace of the string found in `PatientInstanceStageItemCard.tsx`. |
| A3-02 | MessageCircle shown only when discussionSummary?.totalCount > 0 | PASS | Guard is `(discussionSummary?.totalCount ?? 0) > 0`; correctly hides when undefined or 0. |
| A3-03 | Unread dot (destructive red) shown only when unreadCount > 0 | PASS | Inner guard `(discussionSummary?.unreadCount ?? 0) > 0`; dot uses `bg-destructive`. |
| A3-04 | AlertTriangle shown only when item.snapshot.contraindications is truthy | PASS | Guard is `Boolean((item.snapshot as Record<string, unknown>)?.contraindications)`. |
| A3-05 | PatientProgramItemExecutionRow only rendered when appDisplayTimeZone is provided | PASS | Wrapped in `{appDisplayTimeZone ? ... : null}`. |
| A3-06 | lastDoneAtIsoByItemId properly destructured and passed | PASS | Destructured at line 77; passed as `lastIso={lastDoneAtIsoByItemId?.[item.id] ?? null}`. |
| A3-07 | Icon row only shown for non-recommendation items | PASS | Entire icon row div is inside `{item.itemType !== "recommendation" ? ... : null}`. |
| A3-08 | Both PatientInstanceStageItemCard calls in PatientInstanceStageBody pass appDisplayTimeZone | FAIL | First call (grouped items, line 132) passes `appDisplayTimeZone={appDisplayTimeZone}`. Second call (ungrouped items, line 170) omits `appDisplayTimeZone` entirely — execution dots will be silently suppressed for all ungrouped items. |
| A3-09 | PatientTreatmentProgramStagePageClient passes appDisplayTimeZone to PatientInstanceStageBody | PASS | Line 441: `appDisplayTimeZone={appDisplayTimeZone}` passed at both call sites (archive block line 441, and main block line 541 via PatientTreatmentProgramStagePageProgramSection). |
| A3-10 | TypeScript compiles clean | PASS | `npx tsc --noEmit` on `apps/webapp/tsconfig.json` exits 0 with no output. |
| A3-11 | discussionSummary data is actually fetched | PASS | `PatientTreatmentProgramStagePageProgramSection.tsx` fetches from `/api/patient/treatment-program-instances/{id}/discussion/summary` via `loadDiscussionSummary()` and passes the result as `discussionSummary` prop to cards. The fetch is gated on `programCommentsInteraction.visible`. Note: `PatientInstanceStageBody` (used for the read-only archive stage view in `PatientTreatmentProgramStagePageClient`) does NOT fetch or pass `discussionSummary` — the prop is always undefined there. This appears intentional (archive view, `itemInteraction="readOnly"`), but is worth confirming. |

## OVERALL: FAIL

**Reason:** A3-08 fails. The second `PatientInstanceStageItemCard` render in `PatientInstanceStageBody.tsx` (ungrouped items, line 170–195) omits `appDisplayTimeZone`. As a result, execution dots (`PatientProgramItemExecutionRow`) will never render for ungrouped stage items in that component. The fix is to add `appDisplayTimeZone={appDisplayTimeZone}` to that second card call.

**Fix required:** In `/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/patient/treatment/program-detail/PatientInstanceStageBody.tsx`, add `appDisplayTimeZone={appDisplayTimeZone}` to the ungrouped-items `PatientInstanceStageItemCard` (around line 193, after `planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}`).

---

## Independent audit notes (Sonnet 4.6 subagent)

Fully confirms A3-08 FAIL. Additional observations:

**A3-11 (discussionSummary in archive path):** `PatientInstanceStageBody` is used with `itemInteraction="readOnly"` for past stages. The lack of `discussionSummary` threading here appears intentional — the archive view doesn't need live comment counts. Not a defect.

**Empty icon row div:** When all three children are null (no discussionSummary, no contraindications, no appDisplayTimeZone), the `<div class="mt-1 flex...">` still renders, adding a small top margin. Low cosmetic impact, not a DoD blocker.

**variant=tile confirmed:** `PatientProgramItemExecutionRow.tsx` line 53 defines `variant?: "tile" | "itemPage"` — tile path is fully implemented at lines 93–102.

**TypeScript:** `tsc --noEmit` exits rc=0. All new props correctly typed as optional for backward compat.

**Contraindications source:** Implementation reads directly from `item.snapshot.contraindications` rather than threading a `hasContraindications` prop. Functionally equivalent and arguably better (fewer props). DoD says "from parent" but this is an acceptable shortcut since `item` is already the prop.

**Verdict confirms FAIL (1 defect):** A3-08 is the sole blocking defect. Fix is one line.
