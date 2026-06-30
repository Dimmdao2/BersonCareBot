# Code Audit 2 (chief, independent) — SCH-R-01, SCH-R-07, SCH-R-02, SCH-R-03

**Date:** 2026-06-19
**Auditor:** CODE-AUDITOR-2 (chief), agent `chief15-sch-r-03a6`
**Branch:** `feat/doctor-ui-rebuild`
**Base commit:** `2c822456` → `HEAD` (`0019bd58`)
**Scope:** SCH-R-01..03 + SCH-R-07 atomicity fix. QW-C8 NOT re-audited (already CLOSED: vis14-qw-c8 + chief14-qw-c8).
**TypeScript:** `tsc --noEmit -p apps/webapp/tsconfig.json` — CLEAN (rc=0, via run-tests.sh mutex)
**Relation to audit-1:** audit-1 returned FAIL+1 on SCH-R-07 (non-atomic replace=true). Fix shipped in `0503abc4` + merge `0019bd58`. This audit re-verifies the fix and independently re-checks all four items.

---

## SCH-R-01 — Load weekday hours into ScheduleWorkTab state

**DoD (QUEUE.md):** workingHours state populated; lint clean; existing behavior unchanged.

- **WorkingHoursRow type defined + used consistently — PASS.**
  `ScheduleWorkTab.tsx:73-80` defines `WorkingHoursRow {id, weekday, startMinute, endMinute, isActive, branchId}`. Consumed by `resolveEffectiveHours` param (`:147`), the `apiJson<...rows: WorkingHoursRow[]>` generic (`:525`), and the state (`:435`). Local front-end type, no collision with server `WorkingHoursRecord`.
- **loadWorkingHours calls correct endpoint + parses response — PASS.**
  `:520-531` — `GET ${WH_BASE}?specialistId=X` via `apiJson`, `setWorkingHours(json.rows ?? [])`. Endpoint matches admin booking-engine route which returns `{ ok, rows, usesFallback }`. Guard early-returns when `specialistId` empty.
- **Triggered on mount + on relevant changes — PASS.**
  Primary effect `:564` (fires when specialistId ready, alongside loadMonth/loadTemplates), re-activation effect `:567-573`, branch-filter effect `:576-581`. Note: SCH-R-01 scope is state-load only; reload-on-save is SCH-R-08 (separate item).
- **Null/empty/error states handled — PASS.**
  `json.rows ?? []` guards null; `catch {}` non-fatal (`:527-529`); empty array is a valid render input for `resolveEffectiveHours` (`.find` → undefined → null). `specialistId` empty guard at `:521`.
- **Existing behavior unchanged — PASS.** State added alongside existing dayRecords/templates; no existing effect altered except added `loadWorkingHours()` calls.

**SCH-R-01 OVERALL: PASS**

---

## SCH-R-07 — Backend GET weekday filter + POST replace=true (atomic)

**DoD (QUEUE.md):** GET weekday filter works; POST replace=true deactivates-then-inserts; no raw SQL (drizzle only).

- **GET ?weekday=N filter via Drizzle, no raw SQL — PASS.**
  `route.ts:32-33` parses `weekdayRaw` → `weekdayFilter`, passed to `listWorkingHoursAdmin({...weekday})` (`:40`). `pgBookingScheduling.ts:417`: `if (weekday != null) conds.push(eq(beWh.weekday, weekday));` — Drizzle `eq`, no raw SQL.
  Minor (non-blocking, same as audit-1): `parseInt("abc")` → NaN passes the `!= null` guard, yielding 0-row WHERE; not crash. No frontend caller passes `?weekday`; admin-gated. Out of DoD scope.
- **replace=true wraps deactivate UPDATE + INSERT in db.transaction — PASS (audit-1 FAIL now FIXED).**
  `pgBookingScheduling.ts:448-463`:
  ```
  const inserted = await db.transaction(async (tx) => {
    await tx.update(beWh).set({ isActive: false, ... }).where(and(...deactConds));
    return tx.insert(beWh).values({ ... }).returning();
  });
  ```
  Both writes are inside the same `tx` callback → atomic. If insert throws, the transaction rolls back the deactivation. Resolves audit-1 DEFECT-1 (data-loss-under-failure).
- **tx.update / tx.insert used inside the transaction (not db.update/db.insert) — PASS.**
  `grep db\.update|db\.insert|db\.transaction|tx\.update|tx\.insert` over the file returns only: `:308` db.insert (unrelated `beAvailabilityRules`), `:448` db.transaction, `:449` tx.update. The replace-branch INSERT is the chained `tx.insert` at `:450-462` inside the callback. No stray `db.update`/`db.insert` inside the replace branch.
- **No raw SQL, DI-respecting — PASS.** All builders Drizzle; inside existing `createPgBookingSchedulingPort` factory; `beWh`/`and`/`eq`/`isNull` pre-imported.

**SCH-R-07 OVERALL: PASS** (audit-1 defect remediated and confirmed)

---

## SCH-R-02 — resolveEffectiveHours helper + DayCell visual cues

**DoD (QUEUE.md):** cells show effective hours; template/override/closed visually distinguishable.

- **resolveEffectiveHours is a pure function with correct logic — PASS.**
  `:144-162` — no side effects/async. Priority: record.isClosed → `closed`; record with start+end non-null → `override`; else fall through to weekday template; else `null`. A record present with null start/end correctly falls through to template.
- **Luxon weekday mapping `luxonWd % 7` — PASS.**
  `:156-158`. Mon=1→1, Tue=2→2 … Sat=6→6, Sun=7→0. Matches be_working_hours (0=Sun,1=Mon..6=Sat). Verified for all 7 values.
- **DayCell shows template vs override vs closed distinctly — PASS.**
  `:334-346`: override = bold colored/primary `formatHourRange`; template = italic muted `~HH:MM–HH:MM`; closed = destructive "выходной". Three visually distinct states. Backward-compat fallback for callers without effectiveHours at `:347-352`.
  Spec note (not a defect): QUEUE.md SCH-R-02 wording says `closed=strikethrough`; downstream SCH-R-06 specifies `closed=«выходной» destructive`, which is what is implemented — spec evolution, distinguishability satisfied.

**SCH-R-02 OVERALL: PASS**

---

## SCH-R-03 — Weekday header click selects entire weekday column

**DoD (QUEUE.md):** click Пн → all Mondays highlighted; re-click or date-click clears; no UI regression.

- **Weekday mapping `[1,2,3,4,5,6,0][colIndex]` correct + consistent — PASS.**
  Header `:904` and handler `:616` use the identical array. col0→1(Mon), col5→6(Sat), col6→0(Sun). Filter inside handler (`:629-631`) computes `luxonWd % 7 === wd` — same mapping as resolveEffectiveHours. Consistent across header/handler/resolver.
- **selectionMode "dates"|"weekday" state handled — PASS.**
  `:421` selectionMode, `:422` selectedWeekday, both typed/initialized. Weekday click sets `weekday` mode + selectedWeekday (`:634-636`); re-click same weekday clears to `dates` + empty set (`:617-622`); any date click resets to `dates`+null (`:608-609`).
- **Clicking weekday header selects that column — PASS.**
  `:625-636` builds month grid, filters dates whose `luxonWd % 7 === wd`, `setSelected(matching)`.
- **Header is `<button>` with aria-pressed — PASS.**
  `:907-921`: `<button type="button">` with `aria-label` and `aria-pressed={isActiveWd}`, active-column highlight via `cn()`. Styling preserved; no UI regression.

**SCH-R-03 OVERALL: PASS**

---

## Summary

| Item | Verdict | Notes |
|------|---------|-------|
| SCH-R-01 | **PASS** | state load-only scope; reload-on-save is SCH-R-08 |
| SCH-R-07 | **PASS** | audit-1 atomicity FAIL now FIXED + confirmed |
| SCH-R-02 | **PASS** | strikethrough→«выходной» = spec evolution, not defect |
| SCH-R-03 | **PASS** | mapping consistent across header/handler/resolver |

**OVERALL: PASS (4/4).** tsc clean. SCH-R-07 audit-1 defect remediated via `db.transaction`.
No new defects found.

— signed: chief15-sch-r-03a6 (CODE-AUDITOR-2, chief, independent of auditor a8772f4fe36da6d47)
