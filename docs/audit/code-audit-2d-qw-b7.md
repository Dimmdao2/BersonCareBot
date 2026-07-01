# Code Audit 2d — QW-B7 Panel UI Additions

**Commit audited:** `65d0b70c` (fix(QW-B7): preserve full scheduleData in warmup route + expose dayFilter in panel)  
**Branch:** `auto/qw-b7` / `feat/doctor-ui-rebuild`  
**Date:** 2026-06-19  
**Auditor:** Sonnet-high (read-only)  
**Standard:** DEEP AUDIT — full data-flow tracing, edge cases, active bug search

---

## Scope

Files introduced/modified by this commit (first audit of the panel UI additions):
- `apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts`
- `apps/webapp/src/app/app/doctor/clients/DoctorClientWarmupSchedulePanel.tsx`

Prior audit history:
- audit1: PASS (initial implementation — ReminderCreateDialog defaults + basic panel)
- audit2 / audit2b: FAIL (TS2322 spread type error with `?? {}`)
- audit2c: PASS (typed fallback `?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS` resolves TS)

---

## Clause Results

### E1 — GET returns full scheduleData

**PASS**

**How verified:** Read entire GET handler (route.ts lines 24–73). The handler checks `warmupRule.scheduleData` for nullity before building the response object. When non-null:
- `timesLocal` is always returned
- `dayFilter` is returned with `?? "weekdays"` fallback (safe)
- `daysMask`, `everyNDays`, `anchorDate` are conditionally spread using truthiness guards

When `scheduleData` is null (old `interval_window` or missing rule), the response returns `scheduleData: null`.

**Edge case — null scheduleData:** Handled correctly. The outer ternary `warmupRule.scheduleData ? { ... } : null` prevents any property access on null.

**Edge case — no warmupRule:** Handled. Outer ternary returns `rule: null`.

---

### E2 — PATCH schema completeness

**PASS**

**How verified:** Read `patchSchema` (route.ts lines 14–22):
```typescript
const patchSchema = z.object({
  timesLocal: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(10),
  dayFilter: z.enum(["weekdays", "weekly_mask", "every_n_days"]).optional(),
  daysMask: z.string().regex(/^[01]{7}$/).optional(),
  everyNDays: z.number().int().min(1).optional(),
  anchorDate: z.string().optional(),
});
```

Types are correct:
- `timesLocal`: array of HH:MM strings, min 1, max 10 — matches `SlotsV1ScheduleData`
- `dayFilter`: enum matches `ReminderDayFilter` type in `scheduleSlots.ts`
- `daysMask`: 7-char `[01]` regex — matches downstream validation in `normalizeSlotsV1ScheduleData`
- `everyNDays`: positive integer — matches usage
- `anchorDate`: unconstrained string (no date format validation) — minor but consistent with existing service code

No cross-field validation is done at the schema level (e.g., daysMask required when dayFilter=weekly_mask), but this is deferred to `normalizeSlotsV1ScheduleData` in the service layer.

---

### E3 — PATCH data merge correctness

**FAIL**

**Defect: Stale `daysMask` leaks into DB when switching from `weekly_mask` to `weekdays`**

**Location:** `route.ts` lines 111–116

```typescript
const existingBase = warmupRule.scheduleData ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS;
const scheduleData = {
  ...existingBase,
  ...parsed.data,
  dayFilter: parsed.data.dayFilter ?? existingBase.dayFilter,
};
```

**Root cause:** When the panel saves with `dayFilter: "weekdays"` (and does not include `daysMask` in the request body), Zod's `.optional()` means the key is **absent** from `parsed.data` — not `undefined`. The spread `...parsed.data` therefore does NOT overwrite `daysMask` from `existingBase`. The stale `daysMask: "1010101"` from a prior `weekly_mask` rule persists in the merged object and is written to the DB.

**Verified empirically** (Node.js test in `apps/webapp/`):
```
body = { timesLocal: ["09:00"], dayFilter: "weekdays" }
parsed.data has daysMask key: false
merged = { timesLocal: ["09:00"], dayFilter: "weekdays", daysMask: "1010101" }
```

**Downstream check:** `normalizeSlotsV1ScheduleData` does NOT strip the stale `daysMask` — it only validates `daysMask` when `dayFilter === "weekly_mask"`. Line 72–78:
```typescript
const next: SlotsV1ScheduleData = {
  ...data,          // includes stale daysMask
  timesLocal: sortedTimes,
  ...(data.dayFilter === "weekly_mask" && data.daysMask ? { daysMask: ... } : {}),
};
```
The `...data` spread includes the stale `daysMask` regardless of `dayFilter`.

**Impact:** DB stores `daysMask: "1010101"` even though `dayFilter` is `"weekdays"`. Most downstream consumers correctly check `dayFilter` before consulting `daysMask`, so this is not a runtime error. However, it is a data corruption / garbage data bug that violates the invariant that `daysMask` is only present when `dayFilter === "weekly_mask"`.

**Fix (minimal):** Strip `daysMask` and `everyNDays`/`anchorDate` when they are not relevant to the new `dayFilter`:
```typescript
const rawMerged = { ...existingBase, ...parsed.data };
const newDayFilter = parsed.data.dayFilter ?? existingBase.dayFilter;
const scheduleData: SlotsV1ScheduleData = {
  timesLocal: rawMerged.timesLocal,
  dayFilter: newDayFilter,
  ...(newDayFilter === "weekly_mask" && rawMerged.daysMask
    ? { daysMask: rawMerged.daysMask }
    : {}),
  ...(newDayFilter === "every_n_days" && rawMerged.everyNDays
    ? { everyNDays: rawMerged.everyNDays, ...(rawMerged.anchorDate ? { anchorDate: rawMerged.anchorDate } : {}) }
    : {}),
};
```

**Note:** The explicit `dayFilter: parsed.data.dayFilter ?? existingBase.dayFilter` line (line 115) is harmless but redundant — `...parsed.data` already sets `dayFilter` when present, and `existingBase` sets it when absent. Not a bug.

---

### E4 — Panel dayFilter selector

**PASS** (with advisory)

**How verified:** Read full `load()` callback and `onSave()` and render section.

Loading from GET (lines 74–80):
- `dayFilter` extracted with `?? "weekdays"` fallback ✓
- `every_n_days` silently remapped to `"weekdays"` (see advisory below)
- `daysMask` loaded only when `dayFilter === "weekly_mask"` and mask passes `/^[01]{7}$/` ✓
- Defaults to `DEFAULT_DAYS_MASK` (`"1111100"`, Mon–Fri) otherwise ✓

Selector display (lines 169–189):
- `Select` driven by `dayFilter` state ✓
- Only `weekdays` and `weekly_mask` shown in options (intentional design choice) ✓

Day toggle display (lines 192–207):
- Shows only when `dayFilter === "weekly_mask"` ✓
- `daysMask[i] === "1"` comparison is safe — out-of-bounds returns `undefined`, which is `!== "1"` (shows unchecked) ✓

Save (lines 100–115):
- Guard: `weekly_mask` with all zeros blocked with error message ✓
- `daysMask` only included in body when `dayFilter === "weekly_mask"` ✓

`toggleDay` (lines 90–94):
- Uses `.padEnd(7, "0").slice(0, 7)` defensive normalization ✓

**Advisory — silent `every_n_days` overwrite:** If a patient's rule has `dayFilter: "every_n_days"`, the panel silently converts it to `"weekdays"` on load (line 75). If the doctor then saves without changing anything (e.g., just confirming the time slots), the patient's `every_n_days` rule is overwritten with `weekdays`. This is a data-loss scenario. Since `every_n_days` is not yet supported in the UI, this is a known design limitation, but it is **silent** — the doctor gets no warning. Severity: low (rare config, no runtime crash), but worth documenting.

---

### E5 — WarmupScheduleData type widened correctly

**PASS**

**How verified:** Panel defines a local type (lines 21–26):
```typescript
type WarmupScheduleData = {
  timesLocal: string[];
  dayFilter: ReminderDayFilter;
  daysMask?: string;
  everyNDays?: number;
  anchorDate?: string;
};
```

This is structurally identical to `SlotsV1ScheduleData` from `scheduleSlots.ts` (verified). Imports `ReminderDayFilter` from the canonical module. No `any` types or casts. The panel could have imported `SlotsV1ScheduleData` directly instead of re-declaring the type, but re-declaration is not a bug — it's a mild DRY violation.

The `WarmupScheduleRule` type (lines 27–32) uses `WarmupScheduleData | null` for `scheduleData`, matching the GET response shape.

---

### E6 — Regression: basic time-only PATCH flow

**PASS**

**How verified:**

1. The panel always sends `dayFilter` in the PATCH body (line 110: `dayFilter,`). Old clients that sent only `timesLocal` would still be valid (patchSchema has `dayFilter` optional). The route handles missing `dayFilter` via `parsed.data.dayFilter ?? existingBase.dayFilter`.

2. The schedule merge now preserves existing fields instead of silently overwriting to defaults (prior bug from audit2 / b3764d2e context). A save from the panel for a `weekdays` rule with updated times correctly updates `timesLocal` and preserves `dayFilter: "weekdays"`.

3. The `normalizeSlotsV1ScheduleData` downstream path is unchanged — it still sorts times, deduplicates, and validates. No regression in that path.

---

### E7 — No raw SQL, no DI violations, no shared-primitive hand-rolling

**PASS**

**How verified:**

- **Route:** Uses `buildAppDeps()` → `deps.reminders.listRulesByUser()` and `deps.reminders.updateRule()`. No raw SQL. Drizzle-backed through port. ✓
- **Panel:** No DB access (client component). Uses `fetch()` to call the route API. ✓
- **UI primitives:** Uses `Button`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger` from `@/shared/ui/doctor/primitives/`. `SelectTrigger` accepts `displayLabel` prop (verified in `select.tsx`). ✓
- **Weekday buttons:** Hand-rolled `<button>` elements with inline Tailwind. No shared primitive existed for individual day toggles — acceptable since no reusable day-toggle primitive exists in the shared UI library. Not a violation.
- **Imports:** `ReminderDayFilter` imported from canonical `@/modules/reminders/scheduleSlots`. No cross-layer violation.

---

## Summary

| Clause | Result | Notes |
|--------|--------|-------|
| E1 — GET returns full scheduleData | PASS | null scheduleData handled correctly |
| E2 — PATCH schema completeness | PASS | All fields validated with correct types |
| E3 — PATCH data merge correctness | **FAIL** | Stale `daysMask` leaks when switching `weekly_mask` → `weekdays` |
| E4 — Panel dayFilter selector | PASS (advisory) | Silent `every_n_days` → `weekdays` overwrite on save |
| E5 — WarmupScheduleData type | PASS | Correct, mild re-declaration DRY issue only |
| E6 — Regression: time-only PATCH | PASS | No regression in basic flow |
| E7 — No raw SQL, DI, hand-rolling | PASS | Clean architecture respected |

---

## Verdict: FAIL

**One defect requires a fix before this commit can be sealed:**

**E3 — Stale daysMask persists in DB when switching from `weekly_mask` to `weekdays`**

Fix location: `apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts` lines 111–116.

Fix: After computing `newDayFilter`, explicitly strip `daysMask`/`everyNDays`/`anchorDate` that are not relevant to the new filter mode, rather than blindly spreading `existingBase` and relying on `parsed.data` to overwrite them (which it does NOT for absent optional fields).

One advisory (no fix required):
- E4: Silent `every_n_days` → `weekdays` conversion on doctor panel save. Low severity given `every_n_days` is currently not user-configurable. Consider displaying a read-only badge or warning when the existing rule uses an unsupported `dayFilter` variant.
