# code-audit-1 CR-5 — 2026-06-17

## Verdict: FAIL

| Clause | Result | Notes |
|--------|--------|-------|
| Bug A — DEFAULT_WORKING removed | PASS | `pickWorkingHours` now returns `rows` as-is. `DEFAULT_WORKING` constant and conditional branch removed. |
| Bug A — no phantom slots | PASS | `pickWorkingHours([])` returns `[]` (length 0). `workingIntervalsForDate` with empty rows returns empty. Test confirmed. |
| Bug B — service.ts passes specialistId | PASS | `listWorkingHours` receives `filters.specialistId ?? null`. New comment clarifies intent. However, this code was ALREADY correct at the actual merge-base (1e745226) — the worker added comments only, not a functional change. The new test is the real value-add. |
| Bug B — API route caller | FAIL | `/api/doctor/booking-engine/calendar/route.ts` passes `parsed.specialistId` (from URL query params), NOT the authenticated doctor's specialistId from session. `ScheduleCalendarTab.tsx` (line 839-845) builds the URL with `{branchId, serviceId}` but omits `specialistId`. So when a doctor views their own calendar, `specialistId` is null → the working-hours query returns only global rows (IS NULL), not the doctor's specific rows. Bug B is NOT fixed at the system level. Note: this is pre-existing behavior, not introduced by this worker. |
| Drizzle-only | PASS | No raw SQL in any changed file. |
| Tests — coverage | PASS | Two new tests in computeSlots.test.ts (empty→0 length; Monday with empty rows→0 intervals). Two new tests in service.test.ts (specialistId forwarded to listWorkingHours; empty rows → zero working events). All 11 tests pass. |
| tsc — clean | PASS | `npx tsc --noEmit` exits 0 with no errors in the worktree. |
| Scope — owned files only | PASS* | Git diff (3-dot, relative to actual merge-base 1e745226) shows exactly 4 files: `computeSlots.ts`, `computeSlots.test.ts`, `service.ts`, `service.test.ts`. No other files touched. |

## Issues (FAIL)

### Critical: Stale branch base — worktree is behind origin/feat/doctor-ui-rebuild by multiple commits

**Severity: BLOCKER for merge**

The worktree was forked from commit `1e745226` (merge-base), but the specified base is `0e5bb9f1` (current tip of `origin/feat/doctor-ui-rebuild`). Between those two commits, the main branch added substantial features to the exact files the worker modified:

- **`computeSlots.ts`**: Commits between `1e745226` and `0e5bb9f1` added `WorkingDayRow`, `splitByBreak`, `resolveWorkingDayBreaks`, `deriveWorkingBounds`, `computeNearestFreeWindowFromData`, and `utcMsToLocalMinute` (~180 lines). These are absent from the worktree.
- **`service.ts`**: The tip version adds `toEffectivePerDayRow`, `deriveWorkingBounds` (in-service), `listWorkingDays` parallel fetch, per-date row override logic, and `workingBounds` in the response. The worktree's service.ts is 164 lines vs 251 lines in the tip.

**Impact**: If the worktree branch is merged into `origin/feat/doctor-ui-rebuild` HEAD (`0e5bb9f1`), it will cause merge conflicts and/or silently revert the per-date working-day override feature, the N-break model, `deriveWorkingBounds`, `workingBounds` in calendar API response, and `computeNearestFreeWindowFromData`. These features are actively used by:
- `apps/webapp/src/app/app/doctor/page.tsx` — calls `deriveWorkingBounds` (from computeSlots.ts)
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx` — uses `workingBounds` from API response
- `apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx` — uses `workingBounds`

### Bug B — system-level not resolved

**Severity: Pre-existing, but audit clause requires explicit FAIL**

The audit criterion states: "If the API route uses `specialistId: null` or doesn't pass it, Bug B is NOT actually fixed at the system level."

`ScheduleCalendarTab.tsx` (line 839-845) calls `fetch(`${API_BASE}/calendar?${qs}`)` where `qs` is built from `{view, from, to, branchId, serviceId}` — `specialistId` is deliberately omitted. The `parseCalendarQuery` function correctly reads `specialistId` from URL params when present, but no caller in the doctor-portal path sets it. The session in `requireDoctorBookingEngine` provides `userId` but not `specialistId` (would require a DB lookup).

This is pre-existing behavior, not introduced by this worker. The worker fixed the service-layer correctly and added a good test. The system-level gap requires a separate fix (injecting the doctor's specialistId from session into the API route or the frontend URL).

## Summary

The CR-5 fix itself (removing DEFAULT_WORKING, adding tests) is correct and clean. The primary FAIL reason is that the worktree was created from a stale base (`1e745226`) and is **incompatible with the current tip** of `origin/feat/doctor-ui-rebuild` (`0e5bb9f1`). Merging as-is would revert significant post-fork features. The worker must rebase onto the current tip and re-integrate their changes before this can be accepted.
