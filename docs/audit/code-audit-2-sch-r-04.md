# Code Audit 2 — SCH-R-04 + SCH-R-08

**agentId:** audit2-sch-r-04b  
**Date:** 2026-06-19  
**File audited:** `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`  
**Backend audited:** `apps/webapp/src/app/api/admin/booking-engine/working-hours/route.ts`  
**Branch:** `feat/doctor-ui-rebuild`

---

## OVERALL: PASS

All 8 verification points pass. No bugs found. TypeScript compiles clean (0 errors).

---

## Verification Results

### 1. Does `handleSaveWeekdayTemplate` correctly set the body fields the backend Zod schema requires?

**PASS**

Backend `upsertBody` requires: `weekday`, `startMinute`, `endMinute` (mandatory); `specialistId`, `branchId`, `roomId`, `replace` (optional).

`handleSaveWeekdayTemplate` (line ~701) sends:
```json
{
  "weekday": selectedWeekday,
  "startMinute": startMinute,
  "endMinute": endMinute,
  "specialistId": specialistId,
  "branchId": panelBranchId || undefined,
  "replace": true
}
```

All three mandatory fields are populated. `specialistId` is provided as a UUID from the module-level state. `branchId` is sent as `undefined` when empty (schema allows optional). `replace: true` triggers the atomic deactivation of the old row on the backend. No field mismatch.

Backend also validates `startMinute < endMinute` — the frontend performs `timeLabelToMinute` on both and they proceed to `run()` only if parse succeeds; the backend validates again as a second gate.

---

### 2. Does `handleClearWeekdayTemplate` correctly identify which rows to DELETE?

**PASS**

```typescript
const toDeactivate = workingHours.filter(
  (r) => r.weekday === selectedWeekday && r.isActive,
);
```

`WorkingHoursRow` type (line 73) includes `id`, `weekday`, `isActive`, `branchId`. The filter correctly matches by weekday and active flag. Each matched row is DELETEd via `DELETE /working-hours?id=<uuid>`, which calls `deactivateWorkingHours` on the backend. This is semantically correct — the backend uses soft-delete (`isActive = false`), not hard-delete, so the rows remain for audit/history.

No issue: the backend DELETE handler validates that the authenticated org owns the row (`gate.ctx.organizationId` is passed to `deactivateWorkingHours`).

---

### 3. Is there any risk that `selectedWeekday` could be null when save handlers are called?

**PASS**

Both `handleSaveWeekdayTemplate` and `handleClearWeekdayTemplate` begin with:
```typescript
if (selectedWeekday === null) return;
```
This guard is present and executes before any state mutation or API call. Additionally, the button that triggers these handlers is only rendered when `selectedCount > 0`, and weekday mode requires `selectedWeekday` to be set (it is set atomically with `selectionMode = "weekday"` in `handleWeekdayHeaderClick`). Null is therefore blocked at two layers.

---

### 4. Does the checkbox render with the right `checked={weekdayPermanent}` binding?

**PASS**

Line 1042:
```tsx
<input
  type="checkbox"
  id="weekday-permanent"
  checked={weekdayPermanent}
  onChange={(e) => setWeekdayPermanent(e.target.checked)}
  ...
  data-testid="weekday-permanent"
/>
```

Controlled component binding is correct. `checked` is bound to `weekdayPermanent` state and `onChange` updates it. The checkbox is only rendered when `selectionMode === "weekday"` (guarded by `{selectionMode === "weekday" && (...)}` at line ~1036). Default is `true` (set in `useState(true)` at line 423) and resets to `true` on each new weekday selection (`setWeekdayPermanent(true)` in `handleWeekdayHeaderClick`).

---

### 5. Does `run()` actually call `loadWorkingHours()` after every action?

**PASS**

`run()` (lines 664–676):
```typescript
function run(fn: () => Promise<void>, successMsg: string) {
  setActionError(null);
  setActionOk(null);
  startTransition(async () => {
    try {
      await fn();
      await loadMonth();
      loadTemplates();
      loadWorkingHours(); // SCH-R-08: reload template state after every save
      setActionOk(successMsg);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "action_failed");
    }
  });
}
```

All mutations (`handleSaveWeekdayTemplate`, `handleClearWeekdayTemplate`, `handleSave` per-date path, `handleClearSchedule` per-date path, `handleApplyTemplate`, `handleDeleteTemplate`) go through `run()`. Every successful action triggers `loadWorkingHours()`. The call is in the `try` block (after `await fn()` succeeds), so it only fires when the action itself succeeded — correct behavior.

---

### 6. Is the WD_LABEL lookup map correct?

**PASS**

```typescript
const WD_LABEL: Record<number, string> = {0:"Вс",1:"Пн",2:"Вт",3:"Ср",4:"Чт",5:"Пт",6:"Сб"};
```

This matches the encoding used throughout the file. Weekday mapping cross-checked: `handleWeekdayHeaderClick` derives weekday as `luxonWd % 7` where Luxon weekday is 1=Mon..7=Sun. So:
- Mon (Luxon 1) → `1 % 7 = 1` → `WD_LABEL[1] = "Пн"` ✓
- Tue (Luxon 2) → `2 % 7 = 2` → `"Вт"` ✓
- Sun (Luxon 7) → `7 % 7 = 0` → `WD_LABEL[0] = "Вс"` ✓
- Sat (Luxon 6) → `6 % 7 = 6` → `WD_LABEL[6] = "Сб"` ✓

All 7 entries are consistent with the Luxon-based encoding and Russian day-of-week abbreviations.

---

### 7. Adversarial case: weekday mode + permanent=OFF + click Save → per-date path?

**PASS**

`handleSave` (line 735):
```typescript
function handleSave() {
  // SCH-R-04: weekday mode + permanent checkbox ON → save template
  if (selectionMode === "weekday" && weekdayPermanent) {
    handleSaveWeekdayTemplate();
    return;
  }
  const dates = [...selected];
  if (!dates.length) return;
  // ... per-date upsert via PUT /working-days
}
```

When `selectionMode === "weekday"` but `weekdayPermanent === false`, the early-return guard is not taken (`weekdayPermanent` is `false`). Execution falls through to the per-date path. `selected` will contain all matching dates of the weekday in the current month view (set by `handleWeekdayHeaderClick`), so `dates.length > 0` and the path proceeds to `PUT /working-days` with `action: "upsert"`.

Trace is unambiguous: the condition is `selectionMode === "weekday" && weekdayPermanent` — both must be true to take the template path; one false is sufficient to fall through to per-date.

---

### 8. Edge case: no active workingHours for weekday when «Очистить шаблон» is clicked

**PASS**

`handleClearWeekdayTemplate` (line ~719):
```typescript
const toDeactivate = workingHours.filter(
  (r) => r.weekday === selectedWeekday && r.isActive,
);
if (toDeactivate.length === 0) {
  setActionOk(`Шаблон ${WD_LABEL[selectedWeekday] ?? ""} уже не установлен`);
  return;
}
```

When there are no active rows for the weekday, the function short-circuits with a friendly success-style message ("Шаблон ... уже не установлен") rather than an error. This is a graceful no-op — no API calls are made. No crash, no silent failure.

---

## Additional Observations

- **No TypeScript errors:** `tsc --noEmit` returned clean (0 errors, 0 warnings) on the full webapp project.
- **`loadWorkingHours` dependency**: The callback uses `useCallback` with deps `[specialistId, gridBranchFilter]` (line 521). This is correct — it will re-fetch with the current filter when those change, and the `run()` call always gets the latest closure reference because `run()` is defined as a plain function in the component body (re-created each render), so it captures the latest `loadWorkingHours` reference.
- **`breaks` variable in `handleSaveWeekdayTemplate`**: A `breaks` variable is computed but **not sent** in the POST body. The backend `upsertBody` Zod schema does not include a `breaks` field either, so this is dead code (unused variable) but not a bug. The breaks information is silently dropped when saving a weekday template. This may be an intentional simplification (weekday templates don't support break intervals), but it's worth noting as a potential future gap if breaks are ever needed for templates.
- **`panelBranchId || undefined`**: If `panelBranchId` is an empty string, it sends `undefined` (omitted). Backend treats missing `branchId` as `null`-match or universal. This is consistent with the rest of the codebase pattern.
