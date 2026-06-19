# Code Audit — SCH-R-04 + SCH-R-08

**agentId:** audit1-sch-r-04a
**Branch:** feat/doctor-ui-rebuild
**Commit audited:** 947f6f59
**File:** `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`
**Backend route:** `apps/webapp/src/app/api/admin/booking-engine/working-hours/route.ts`
**Date:** 2026-06-19

---

## Clause 1 — weekdayPermanent state (useState(true), reset on new weekday)

**PASS**

- Line 423: `const [weekdayPermanent, setWeekdayPermanent] = useState(true);` — default ON confirmed.
- Line 639: Inside `handleWeekdayHeaderClick`, `setWeekdayPermanent(true);` is called when a new (or re-clicked) weekday is selected.
- The `handleWeekdayHeaderClick` also handles deselect (re-click same weekday → resets selectionMode to `"dates"` and clears selectedWeekday). The `weekdayPermanent` is not explicitly reset on deselect, but this is inconsequential since the checkbox is only rendered when `selectionMode === "weekday"`.

---

## Clause 2 — handleSaveWeekdayTemplate correctness

**PASS** (with one dead-code observation — not a DoD failure)

- Called only when `selectionMode === "weekday" && weekdayPermanent === true` (line 737, early-return in `handleSave`).
- Time validation via `timeLabelToMinute(panelStart)` / `timeLabelToMinute(panelEnd)` wrapped in try/catch (lines 686–691).
- Break validation via `validateBreakRows` before proceeding (lines 692–694).
- POST body (lines 704–711):
  - `weekday: selectedWeekday` — correct
  - `startMinute`, `endMinute` — validated numbers
  - `specialistId` — the state value, always a UUID by the time the panel is visible (bootstrapped via `ensureDefaultSpecialist` before calendar renders)
  - `branchId: panelBranchId || undefined` — correctly converts empty string to `undefined`
  - `replace: true` — correctly set

**Dead code observation (non-blocking):** Lines 696–699 compute a `breaks: BreakInterval[]` variable that is never sent in the POST body. The backend `upsertBody` schema (`apps/webapp/src/app/api/admin/booking-engine/working-hours/route.ts`) does not accept a `breaks` field, and `CreateWorkingHoursInput` (`ports.ts` line 221) has no `breaks` field either. The variable is inert (silently dropped), but it is misleading dead code. It should be removed.

---

## Clause 3 — handleClearWeekdayTemplate correctness

**PASS**

- Line 718: Guards `if (selectedWeekday === null) return;`
- Line 719–722: Filters `workingHours` state by `r.weekday === selectedWeekday && r.isActive`.
- Line 723–725: If nothing to deactivate, sets a friendly `actionOk` message and returns without making any requests — empty case handled gracefully.
- Lines 728–731: DELETEs each active row via `apiJson(\`${WH_BASE}?id=${encodeURIComponent(r.id)}\`, { method: "DELETE" })` — correct URL and method matching the backend DELETE handler which reads `?id=` param.

---

## Clause 4 — handleSave routing

**PASS**

- Lines 737–739: `if (selectionMode === "weekday" && weekdayPermanent) { handleSaveWeekdayTemplate(); return; }` — early return so the weekday+permanent path never bleeds into the original WD_BASE path.
- Lines 741+ : original per-date upsert (PUT to `WD_BASE`) is unchanged.
- When `selectionMode === "weekday" && !weekdayPermanent`, execution falls through to the original WD_BASE path with `const dates = [...selected];` — this is the stated fall-through behavior (selected dates of that weekday treated as per-date exceptions).

---

## Clause 5 — handleClearSchedule routing

**PASS**

- Lines 786–789: `if (selectionMode === "weekday") { handleClearWeekdayTemplate(); return; }` — correct early return delegates to template clear.
- Lines 791+: original WD_BASE `action:"clear"` path is unchanged.

---

## Clause 6 — SCH-R-08 reload (loadWorkingHours in run())

**PASS**

- Line 672: `loadWorkingHours();` is called inside `run()` after `await fn()` and `await loadMonth()`.
- The call is not awaited (fire-and-forget), consistent with `loadTemplates()` (also not awaited on line 671).
- The DoD says "loadWorkingHours() called in run() helper" — the call IS present. The fire-and-forget pattern means working hours state reloads concurrently with the success message being set, which is acceptable UX.

---

## Clause 7 — Right panel JSX

**PASS**

- **Title:** Lines 1023–1024 correctly switch title to `Расписание для всех ${WD_LABEL[selectedWeekday] ?? ""} (${selectedCount} дн.)` in weekday mode.
- **Checkbox:** Lines 1036–1049 render checkbox only when `selectionMode === "weekday"`. `id="weekday-permanent"`, `data-testid="weekday-permanent"`, `checked={weekdayPermanent}`, `onChange={(e) => setWeekdayPermanent(e.target.checked)}` — all correct.
- **Hint text:** Lines 1051–1053 render `<p>Сохранится как исключение для каждой выбранной даты</p>` when `!weekdayPermanent` — correct fall-through hint.
- **Button label:** Line 1147: `{selectionMode === "weekday" ? "Очистить шаблон" : "Очистить расписание"}` — correct.

---

## Clause 8 — No regression to per-date mode

**PASS**

- `handleSave` routing (Clause 4) confirms the original per-date PUT to `WD_BASE` is only bypassed when both `selectionMode === "weekday"` AND `weekdayPermanent` are true.
- `handleClearSchedule` routing (Clause 5) confirms the original `action:"clear"` path is only bypassed when `selectionMode === "weekday"`.
- All other handlers (`handleApplyTemplate`, `handleDeleteTemplate`, template creation) are unchanged.

---

## Clause 9 — TypeScript + Security

**PASS**

- `flock /tmp/run-tests.lock npx tsc --noEmit -p apps/webapp/tsconfig.json` completed with no output (zero errors).
- **Admin gate:** The `DELETE` handler in `route.ts` calls `requireAdminBookingEngine()` (line 104) before accepting the `?id=` param. The `deactivateWorkingHours(id, gate.ctx.organizationId)` passes `organizationId` to scope the deactivation — preventing cross-org IDOR.
- The `POST` handler similarly calls `requireAdminBookingEngine()` and injects `gate.ctx.organizationId` into `createWorkingHours({ organizationId, ...parsed.data })`.
- `specialistId` in the POST body is the authenticated doctor's own specialist ID (obtained via `ensureDefaultSpecialist` — a server-side bootstrap that returns the org-scoped canonical specialist). No cross-org specialist exposure.

---

## Issues Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | Low / Dead code | Lines 696–699 in `handleSaveWeekdayTemplate` compute `const breaks: BreakInterval[]` but never include it in the POST body. Backend schema has no `breaks` field for working-hours. The variable should be removed to avoid future confusion. |

---

## OVERALL: PASS

All 9 DoD clauses pass. One low-severity dead-code finding (unused `breaks` variable in `handleSaveWeekdayTemplate`) is noted but does not affect correctness or functionality. The DoD does not include a `breaks` requirement for working-hours templates.
