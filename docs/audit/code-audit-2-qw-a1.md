# Code Audit #2 — QW-A1

**Branch:** `auto/qw-a1`
**Commit:** `92f2a691`
**File:** `apps/webapp/src/app/app/patient/treatment/PatientProgramStageItemPageClient.tsx`
**Auditor:** Claude Sonnet 4.6 (code-auditor-2, independent)
**Date:** 2026-06-19

---

## VERDICT: FAIL

One behavioral defect found: stale form state when navigating between items (regression vs old modal).

---

## Check Results

### A. Pre-fill behavior

| Check | Result |
|---|---|
| `repsRaw` set from `lds.reps` (String conversion) | PASS — line 532 |
| `weightRaw` set from `lds.weightKg` (String conversion) | PASS — line 533 |
| `difficulty` set from `lds.perceivedDifficulty` | PASS — line 534 |
| Null guard: null values do not overwrite state | PASS — `if (lds.reps != null)` / `if (lds.weightKg != null)` / `if (lds.perceivedDifficulty)` |
| **DEFECT: Fields NOT reset when switching to item with no history** | **FAIL — see §Defects** |

### B. Submit without modal

| Check | Result |
|---|---|
| `handleComplete()` has no dialog-open call | PASS — no `setCompleteDialogOpen` anywhere in file |
| After success: calls `refresh()` | PASS — line 560 |
| After success: calls `loadDiscussionPreview()` | PASS — line 561 |
| No `setCompleteDialogOpen(false)` in success path | PASS |
| Error set via `setError(result.error)` when not ok | PASS — line 557 |

### C. Cooldown / frozen state

| Check | Result |
|---|---|
| Submit button `disabled={busy !== null || simpleCompleteDoneFrozen}` | PASS — line 885 |
| Reps input `disabled={busy !== null || simpleCompleteDoneFrozen}` | PASS — line 864 |
| Weight input `disabled={busy !== null || simpleCompleteDoneFrozen}` | PASS — line 873 |
| Difficulty buttons `disabled={busy !== null || simpleCompleteDoneFrozen}` | PASS — line 822 |
| Frozen submit shows Check icon + "Выполнено" | PASS — lines 888–895 |

### D. API payload correctness

| Check | Result |
|---|---|
| `perceivedDifficulty` from `difficulty` state (correct union type) | PASS |
| `reps` via `parseOptionalPositiveInt(repsRaw)` → positive int or undefined | PASS |
| `weightKg` via `parseOptionalNonNegativeNumber(weightRaw)` → non-negative or undefined | PASS |
| Payload shape matches `ProgramItemCompleteDialogPayload` | PASS — TypeScript RC=0 |

### E. Dead code removal

| Check | Result |
|---|---|
| `completeDialogOpen` state | PASS — removed |
| `setCompleteDialogOpen` calls | PASS — zero occurrences |
| `ProgramItemCompleteDialog` in JSX | PASS — removed |
| `ProgramItemCompleteDialogPayload` import | PASS — removed from this file |
| `ProgramItemCompleteDialog` import | PASS — removed |

Note: `postProgramItemComplete.ts` still imports `ProgramItemCompleteDialogPayload` from
`ProgramItemCompleteDialog` (the dialog file still exists). This is outside QW-A1 scope but is noted
for completeness — the dialog file is not deleted, only its usage in this component is removed.

### F. itemId effect cleanup

| Check | Result |
|---|---|
| `setCompleteDialogOpen(false)` removed from itemId effect | PASS — itemId effect (lines 537–539) only resets `setDiscussionDialogOpen(false)` |

### G. TypeScript compilation

```
RC=0
```

PASS — `npx tsc --noEmit -p apps/webapp/tsconfig.json` exits with RC=0.

---

## Defects

### DEFECT-1 (Blocking): Stale form state on item navigation

**Severity:** Blocking — behavioral regression vs old modal

**Location:** `useEffect` at lines 529–535, `useEffect` at lines 537–539

**Description:**

When the patient navigates from item A to item B (via Prev/Next links), the `repsRaw`, `weightRaw`,
and `difficulty` form fields are NOT reset. They retain item A's values until item B's
`lastDoneSummary` loads and has non-null values.

**Root cause:**

The only state cleanup on `itemId` change is in the effect at line 537–539, which only resets
`setDiscussionDialogOpen(false)`. The three form fields (`repsRaw`, `weightRaw`, `difficulty`) have
no reset in this effect.

The pre-fill `useEffect` at lines 529–535 depends on `[discussionPreview.lastDoneSummary]`. When
item B is loaded and it has no previous completion history, `lastDoneSummary` becomes `null`. The
effect fires but hits `if (!lds) return;` immediately, leaving all three form fields with item A's
stale data.

**Scenario:**
1. Patient opens item A (has 3 reps, 10 kg, medium difficulty) — form shows A's data.
2. Patient taps "Next" → item B loads (no completion history, `lastDoneSummary = null`).
3. Form still shows "3" / "10" / "medium" from item A.
4. Patient doesn't notice and taps "Записать" — submits item A's data as item B's completion.

**Regression vs old modal:**
The old modal (`ProgramItemCompleteDialog`) was opened fresh on each button click, so it always
started with blank/default values. The inline form persists between navigations, creating a
regression.

**Fix (not applied — audit only):**
In the `useEffect([itemId])` at line 537–539, add form field resets:

```ts
useEffect(() => {
  setDiscussionDialogOpen(false);
  setRepsRaw("");
  setWeightRaw("");
  setDifficulty("medium");
}, [itemId]);
```

This ensures the form starts clean for each new item, and the subsequent pre-fill effect will
overwrite with actual history data once it loads.

---

## Summary

The QW-A1 implementation is structurally correct: imports removed, dead code gone, API payload type-
safe, cooldown guards applied, TypeScript clean. The single blocking issue is the stale form state
regression introduced by using persistent React state for the form instead of a per-open modal. This
can cause a patient to inadvertently record a prior item's metrics under a new item.
