# Code Audit CR-8 — Auditor #2 | agent=cr8-audit2-sonnet | utc=2026-06-18T00:00:00Z

## Summary
PASS (0 issues)

## Checklist

### PASS: NW hex + opacity
`classNames: ["!bg-[#eeeeee]", "!opacity-60"]` — exact `#eeeeee` hex and `opacity: 0.6` as required. Tailwind v4 `!` prefix generates `!important`, so these win the cascade over FC's inline style and `.fc .fc-bg-event { opacity: var(--fc-bg-event-opacity) }`.

### PASS: Break color is clearly darker/denser than NW
Break uses `["!bg-[#d1d5db]", "!opacity-80"]`. `#d1d5db` (Tailwind gray-300, ~rgb 209/213/219) is visually darker than `#eeeeee` (rgb 238/238/238). Opacity 0.8 vs 0.6 also makes break heavier. Contrast is unambiguous.

### PASS: dateClick guard blocks both nonworking AND break
Variable renamed to `isNonWorkingOrBreak`; condition is `kind === "nonworking" || kind === "break"`. Both zone types now short-circuit `dateClick` before the create-panel opens.

### PASS: Scope — single file only
`git diff --name-only` confirms only `ScheduleCalendarTab.tsx` changed. No scope creep.

### PASS: FullCalendar classNames are applied to background event elements
FC v6 `EventContainer` (internal-common.cjs line ~7149) spreads `seg.eventRange.ui.classNames` into `elClasses`, which maps directly to the DOM element's `className`. The `classNames` array in the event definition flows correctly to CSS classes on the rendered `.fc-bg-event` div.

### PASS: `!opacity-60` correctly overrides FC's background-event opacity
FC CSS: `.fc .fc-bg-event { opacity: var(--fc-bg-event-opacity) }` (specificity 0,2,0). Tailwind `!opacity-60` generates `opacity: 0.6 !important` on the element. `!important` wins regardless of specificity. No double-stacking issue — both rules target the same element, and `!important` on the utility rule takes precedence. Final rendered opacity = 0.6 (NW) / 0.8 (break), not multiplied.

### PASS: `!bg-[#eeeeee]` correctly overrides FC's inline backgroundColor
FC's `BgEvent` renders `elStyle: { backgroundColor: seg.eventRange.ui.backgroundColor }` (inline style). The CAL-P1 fix sets `--fc-bg-event-color: transparent` on `.fc`, so the resolved inline `backgroundColor` is `transparent`. `!bg-[#eeeeee]` with `!important` overrides inline styles. Color renders correctly.

### PASS: No TypeScript issues introduced
The diff only changes string literals in `classNames` arrays and adds one string comparison (`=== "break"`) in an already-typed block. No new type surface introduced.

### PASS: eventClick handler already safe for break events
FC's interaction layer (internal-common.cjs line 5858) routes clicks on `.fc-bg-event` elements as date clicks, NOT event clicks. The existing `eventClick` guard `if (!appointment) return;` provides a belt-and-suspenders defense for any edge case. No additional eventClick guard needed.

### PASS: No working-hours regression risk
The `dateClick` guard only matches events where `extendedProps.kind === "nonworking" || kind === "break"`. Working-hour events have `kind === "working"` and are filtered out before being added to `calendarEvents` (they return `null` in the mapping). No working-slot click behavior is affected.

## Verdict
PASS — ready to merge. All spec requirements met, technically sound, no regressions introduced.
