# Code Audit CR-8 | auditor=cr8-audit1-sonnet | utc=2026-06-18T00:00:00Z

## Summary

PASS with one pre-existing gap noted (NOT introduced by CR-8, flagged for awareness).

---

## Findings

### PASS: drizzle-only (§6)
No DB queries touched. Change is purely in `ScheduleCalendarTab.tsx`, modifying `classNames` arrays on background events and the `dateClick` guard. Pure UI.

### PASS: No duplication
Change reuses the existing FC background event pattern (`display: "background"`, `classNames`, `extendedProps`). No new patterns introduced. Consistent with how the pre-existing nonworking fill was handled.

### PASS: No hand-rolled FC approach
Uses FullCalendar's standard `classNames` array on event objects. Verified against FC v6.1.20 internals: `EventContainer.render()` merges `seg.eventRange.ui.classNames` into `elClasses`, which `buildElAttrs` joins into the element's `className`. The Tailwind utility classes land correctly on the `.fc-bg-event` div.

### PASS: NW bg color matches owner spec
`classNames: ["!bg-[#eeeeee]", "!opacity-60"]` — `#eeeeee` at `opacity: 0.6 !important`. Owner spec: `#eee at opacity 0.6`. Exact match.

### PASS: Break bg visually distinct from NW
`classNames: ["!bg-[#d1d5db]", "!opacity-80"]` — `#d1d5db` is Tailwind's `gray-300`, which is noticeably darker than `#eeeeee`. Combined with `opacity: 0.8 !important` vs NW's `0.6`, the break band is more prominent. Satisfies "clearly distinct" and "clearly visible passive band" requirement.

### PASS: dateClick guard covers both nonworking AND break
```tsx
(ev.extendedProps?.kind === "nonworking" ||
  ev.extendedProps?.kind === "break") &&
```
Both kinds are now blocked. Variable renamed `isNonWorking` → `isNonWorkingOrBreak` for clarity. Correct.

### PASS: eventClick already safe for break events
`eventClick` handler: `if (!appointment) return;` — break events have no `appointment` in `extendedProps`, so clicking a break event (if FC even fires eventClick for background events) is a no-op. No regression, no change needed.

### PASS: Tailwind !important classes actually override FC styles
Verified against FC v6.1.20 CSS:
```css
.fc .fc-bg-event { background: var(--fc-bg-event-color); opacity: var(--fc-bg-event-opacity) }
```
`--fc-bg-event-color` is already overridden to `transparent` in the component's `<style>` block (CAL-P1 fix from CR-2/CR-3). Tailwind `!bg-[#eeeeee]` = `background-color: #eeeeee !important` beats the CSS-var background rule. Tailwind `!opacity-60` = `opacity: 0.6 !important` beats the CSS-var opacity rule. Both overrides are effective.

### PASS: FC background event classNames application path verified
`BgEvent` renderer → `EventContainer` → `ContentContainer` → `buildElAttrs`:
```js
attrs.className = (props.elClasses || [])   // ['fc-bg-event']
  .concat(extraClassNames || [])             // from classNameGenerator
  .concat(attrs.className || [])             // from ui.classNames ← our array
  .filter(Boolean).join(' ');
```
Confirmed: our `["!bg-[#eeeeee]", "!opacity-60"]` array items are concatenated and applied to the `.fc-bg-event` element's className. No path-of-failure.

### PASS: classNames format corrected (improvement)
Old break: `["!bg-slate-200/70 !border-l-2 !border-slate-400/60"]` — a single array item containing multiple space-separated classes. Works, but non-idiomatic.
New break: `["!bg-[#d1d5db]", "!opacity-80"]` — correct array of individual class strings. Cleaner. The border (`border-l-2`, `border-slate-400/60`) removal is intentional, consistent with making it a passive fill band rather than an annotated event.

---

## Gap noted (PRE-EXISTING, not a CR-8 regression)

**Drag-select (select callback → `onSelect`) is NOT guarded for break/nonworking zones.**

No `selectOverlap` or `selectConstraint` prop is set. FullCalendar v6 allows drag-selection over background events by default. A user can drag over a break/nonworking area and the `onSelect` handler will fire, opening the create panel.

This gap predated CR-8 — even before this fix, nonworking zones only blocked `dateClick` (single click), not drag-select. CR-8 extends the existing `dateClick` guard to also cover breaks, which is the stated spec. The drag-create gap is out of scope for CR-8.

**Recommended follow-up:** Add `selectOverlap={(event) => event.display !== 'background'}` to FullCalendar props to block drag-create over any background event (nonworking + break). This is a single-line addition and closes the remaining gap fully. Not a blocker for this merge.

---

## Verdict

**PASS — ready to merge.**

All owner DoD clauses are met by the code change:
- (a) `#eee/0.6` on nonworking: YES — `!bg-[#eeeeee] !opacity-60`
- (b) white only on working hours: YES — unchanged from pre-CR-8 (working events return null)
- (c) click on nonworking/Перерыв → no panel: YES — dateClick guard covers both kinds
- (d) Перерыв clearly visible: YES — `#d1d5db` at `0.8` is distinctly darker than NW

No DB changes. No duplication. No test regressions introduced. The Tailwind override mechanism is verified sound against FC v6 internals.
