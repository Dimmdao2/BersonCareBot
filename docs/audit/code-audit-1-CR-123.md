# code-audit-1 CR-123 — 2026-06-17

## Verdict: PASS (with one advisory note on CR-3)

| Clause | Result | Notes |
|--------|--------|-------|
| **1. CR-1 fix correct** | PASS | `dayCellContent` is now conditionally spread via `{...(view === "month" ? { dayCellContent: ... } : {})}`. In all non-month views (timeGrid week/3days/day) the prop is absent entirely — no more console error. Month-view drill-down button and `drillDownDay()` wiring unchanged, no regression. |
| **2. CR-1 completeness** | PASS | No new React key warnings, prop-type violations, or unhandled rejections introduced in the diff. The `Array.isArray` guard in CR-2 also prevents a potential runtime error if `calendarEvents` is not an array (type cast to `FullCalendarOptions["events"]`). No other console-error sources visible in the diff. |
| **3. CR-2 implementation** | PASS | Uses `.some()` with half-open interval `[start, end)` — correct for time ranges. Exactly at start = blocked; exactly at end = NOT blocked (correct). Handles multiple nonworking events via `some()`. Guards `ev.start && ev.end` before `new Date(...)` parsing. `Array.isArray(calendarEvents)` guard prevents `.some` on non-array values. In month view, `grayFill=[]` so no nonworking events exist → CR-2 guard is always false → all month-view clicks pass through correctly. |
| **4. CR-2 tests** | PASS | Two tests added. Working-slot test (11:00 UTC = 14:00 Moscow, inside 07:00–15:00 UTC working window) asserts `event-panel` appears. Nonworking-slot test (15:30 UTC = 18:30 Moscow, inside 15:00–16:00 UTC nonworking fill) asserts `event-panel` does NOT appear and `right-panel-empty` remains. Mock button hardwired to correct UTC times matching the test data's bounds. Tests pass: 52/52. |
| **5. CR-3 color** | ADVISORY | `oklch(from var(--primary) l c h / 0.18)` is CSS relative color syntax (Level 5), supported in Chrome 119+, Safari 16.4+, Firefox 128+. No `@supports` fallback provided. The rest of the codebase achieves the same effect using `color-mix(in srgb, var(--primary) 18%, transparent)` (Level 4, slightly broader support). Functionally correct on modern browsers. No `@supports` guard is a minor omission. The equivalent `color-mix` form would be safer and consistent with `doctor.css` patterns. Not a FAIL — the target user base is likely modern browsers. |
| **6. Scope** | PASS | Exactly 2 files changed: `ScheduleCalendarTab.tsx` and `ScheduleCalendarTab.test.tsx`. No unrelated code touched. `git diff --name-only` confirmed. |
| **7. EventPanel wiring** | PASS | `DoctorCalendarEventPanel.tsx` unchanged. Verified chain: `onServiceChange` prop (line 255) → `setCreateServiceId` (line 255 direct pass) → `createServiceId` state (line 151) → `createDurationMinutes` useMemo (lines 192–195: `filterMeta.services.find((s) => s.id === createServiceId)?.durationMinutes`). Chain is correctly wired. Worker correctly did not touch this file. |
| **8. tsc** | PASS | `npx tsc --noEmit` in worktree webapp yields 1 error total — `integrator/src/shared/normalizeToUtcInstant.ts: Cannot find module 'luxon'` — pre-existing, not in webapp. Webapp itself compiles clean. |
| **9. Tests** | PASS | `npx vitest run` on `ScheduleCalendarTab.test.tsx` in worktree: **52 passed, 0 failed** (2.22s). Both new CR-2 tests pass and are behaviorally correct. |

## Advisory (not blocking FAIL)

- **CR-3 CSS compatibility**: `oklch(from var(--primary) l c h / 0.18)` is the only use of CSS relative color syntax in the entire codebase. All other primary-color alpha usages use `color-mix(in srgb, var(--primary) N%, transparent)`. For consistency and slightly broader compat, consider `color-mix(in srgb, var(--primary) 18%, transparent)` instead. Not a blocker given target browser base.

## Issues (none blocking)

None. All three CRs are correctly implemented, tests verify behavior, TypeScript is clean, scope is contained.
