# Code Audit 2 (adversarial) — SCH-R-05

**Agent:** audit2-sch-r-05 (ДОЁБЩИК)
**Date:** 2026-06-19
**Commit audited:** `3a1125e1` — "feat(SCH-R-05): remove mode switcher and BookingSoloScheduleSection embed"
**File:** `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`

---

## OVERALL VERDICT: PASS WITH NOTE

The production component (`ScheduleWorkTab.tsx`) is clean. All DoD items confirmed removed. TypeScript compiles without error. SCH-R-04 work is intact. One non-blocking note is raised about stale test coverage — logged below.

---

## Clause-by-clause findings

### V1 — Dead references: `BookingSolo`, `mode`, `setMode`, "По датам", "Недельный шаблон"

**PASS.**

- `BookingSolo*` — zero hits in `ScheduleWorkTab.tsx`
- `setMode` — zero hits
- "По датам" — zero hits
- "Недельный шаблон" — zero hits
- `\bmode\b` — three hits, all `// SCH-R-04: weekday mode …` comment annotations. These describe `selectionMode`, not the removed switcher. See V3.

### V2 — Import sweep

**PASS.**

Import block (lines 3–27) contains no `BookingSoloScheduleSection`. The `bookingSoloAdminApi` import at lines 15–21 is retained because `apiJson`/`fetchSoloOverview`/`ensureDefaultSpecialist`/time helpers are still used by the per-date and weekday-template save/clear flows — not orphaned.

### V3 — `selectionMode` is the correct column-type selector

**PASS.**

Line 425:
```ts
const [selectionMode, setSelectionMode] = useState<"dates" | "weekday">("dates");
```

Values are `"dates"` | `"weekday"` — this is the SCH-R-04 column-type selector (clicking a weekday header vs a date cell). All 12 usages are live: they control weekday panel visibility, `weekdayPermanent` save path, grid highlighting, and button label. None are the old top-level schedule-mode switcher (which used different strings and a different state variable).

### V4 — JSX structure post-removal

**PASS.**

No conditional on an old `mode` variable. The sticky bar (lines 889–934) has exactly two unconditional direct children: branch-filter group (E3) and month nav. No mode-switcher block present. `selectionMode` is used only within the content area to control weekday panel vs date-cell rendering, which is correct SCH-R-04 behavior.

### V5 — `BookingSoloScheduleSection` in schedule directory

**NOTE — stale test mock, non-blocking.**

`BookingSoloScheduleSection` appears in `ScheduleWorkTab.test.tsx` only (not the production component):

```
ScheduleWorkTab.test.tsx:10  // мокаем stub
ScheduleWorkTab.test.tsx:11  vi.mock("@/app/app/settings/BookingSoloScheduleSection", ...)
ScheduleWorkTab.test.tsx:13    <div data-testid="booking-solo-schedule-section">
```

The test file also retains five `CAL-02` test cases that assert `data-testid="mode-switcher"`, `mode-btn-per-date`, `mode-btn-weekly`, and `booking-solo-schedule-section` — DOM elements that no longer exist after SCH-R-05.

**Classification:** Non-blocking stale test artifact. The test file (`ScheduleWorkTab.test.tsx`) was last modified at commit `e6c161a7` (before SCH-R-05). The entire jsdom test suite for this branch has a pre-existing environment failure (`ERR_UNKNOWN_BUILTIN_MODULE: node:`) that prevents any `.tsx` test from executing; the CAL-02 tests could not have been green in the current environment regardless of SCH-R-05.  SCH-R-05 did not introduce the test failure — it was already broken. However, SCH-R-05 did not clean up the stale mocks and orphaned CAL-02 assertions, which is a hygiene debt: once the jsdom environment is repaired, these 5 tests will fail with "Unable to find element by testId: mode-switcher".

**Recommendation:** Remove or rewrite the 5 CAL-02 test cases in `ScheduleWorkTab.test.tsx` (lines 533–591) as a separate cleanup task. The stale `vi.mock("@/app/app/settings/BookingSoloScheduleSection", ...)` block (lines 10–14) should also be removed.

### V6 — TypeScript

**PASS.**

```
npx tsc --noEmit -p apps/webapp/tsconfig.json → exit 0 (zero errors)
```

### V7 — No hidden mode in JSX comments or strings

**PASS.**

Zero occurrences of "По датам" or "Недельный шаблон" anywhere in `ScheduleWorkTab.tsx` — not in strings, comments, or JSX text content.

### V8 — SCH-R-04 weekday panel intact

**PASS.**

All SCH-R-04 additions survive SCH-R-05 removal:

| Symbol | Location | Status |
|--------|----------|--------|
| `weekdayPermanent` state | line 427 | present |
| `handleSaveWeekdayTemplate()` | line 685 | present, full implementation |
| `handleClearWeekdayTemplate()` | line 721 | present, full implementation |
| `weekdayPermanent` in `handleSave` | line 741 | present |
| `handleClearWeekdayTemplate` in clear path | line 791 | present |
| `data-testid="weekday-permanent"` checkbox | line 1020 | present |

---

## Summary

SCH-R-05 correctly removed the `mode` state variable, the "По датам"/"Недельный шаблон" toggle UI, and the `BookingSoloScheduleSection` import+embed from `ScheduleWorkTab.tsx`. The production component is clean. TypeScript is error-free.

The one flag: `ScheduleWorkTab.test.tsx` has 5 orphaned `CAL-02` test cases and a stale mock that were not updated as part of this commit. This is hygiene debt, not a runtime regression, since the entire jsdom test suite is already broken branch-wide for unrelated reasons. Tag as DEBT-CAL-02-TEST-CLEANUP for a follow-up.
