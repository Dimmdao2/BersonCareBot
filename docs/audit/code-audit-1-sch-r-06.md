# Code Audit 1 — SCH-R-06
agentId: audit1-sch-r-06a
Branch: auto/sch-r-06
Commit: 025bdcc0
Date: 2026-06-19

---

## Preamble — Branch Topology Warning

**auto/sch-r-06 was NOT rebased onto feat/doctor-ui-rebuild before adding the SCH-R-06 commit.**

- Merge base: `5cb44867` (fix: post-seal fixes — before SCH-R-04 and QW-A3)
- `feat/doctor-ui-rebuild` is 2 commits ahead of that base: `947f6f59` (SCH-R-04+08) → `9ea67baa` (QW-A3)
- `auto/sch-r-06` added `025bdcc0` directly on the stale base

This means: **if auto/sch-r-06 is merged into feat/doctor-ui-rebuild, it will revert SCH-R-04 and QW-A3.** The diff `feat/doctor-ui-rebuild..auto/sch-r-06` shows 107 lines removed (SCH-R-04 weekday template checkbox + QW-A3 icon row) that are not part of the SCH-R-06 change itself.

All clauses below are audited against the **actual SCH-R-06 commit alone** (`git show 025bdcc0`), which touched only `ScheduleWorkTab.tsx` (+7/-1 lines). The branch topology issue is a **separate FAIL** flagged below.

---

## Clause 1 — template source → muted italic text

PASS

How verified:
- `resolveEffectiveHours` (line 143–161): returns `{ source: "template", startMinute, endMinute }` when no day record exists but `workingHours` has an active row for that weekday.
- `DayCell` JSX (line 345–348 post-patch): `effectiveHours?.source === "template"` renders `<div className="mt-0.5 text-[10px] leading-none italic text-muted-foreground">~{formatHourRange(...)}</div>`.
- `italic` class confirmed present. `text-muted-foreground` resolves to `--muted-foreground: hsl(220 9% 46%)` defined in `:root` in `tailwind-engine.css`. `--color-muted-foreground: var(--muted-foreground)` mapped in `@theme inline` block.
- The `~` prefix distinguishes template from a manually-saved override visually.
- Cell background for template: falls to the `else` branch → `bg-card border-border hover:bg-muted/30` (neutral white card). Spec requires "muted italic text" only — no background tint required for template. Consistent.
- Font size changed from `text-[11px]` to `text-[10px]` (1 deletion in the diff). Makes template text slightly smaller than override text (`text-[11px] font-semibold`), reinforcing the secondary/fallback nature of template.
- Edge case: `startMinute` is typed `number` (not nullable) in the `template` branch of `EffectiveHours` union, so `formatHourRange` always receives valid numbers. No null risk.

---

## Clause 2 — override source → primary/bold styling

PASS (with note on branch-colored override path)

How verified:
- `resolveEffectiveHours` (line 150–153): returns `{ source: "override", startMinute, endMinute }` when `record.startMinute != null && !record.isClosed`.
- **Cell background** (line 308–310 post-patch): `effectiveHours?.source === "override"` → `bg-primary/10 border-primary/30 hover:bg-primary/15`. `--primary: hsl(215 35% 40%)` defined in `:root`. Tailwind v4 `@theme inline` maps `--color-primary: var(--primary)`. `bg-primary/10` renders as steel-blue at 10% opacity. Valid.
- **Branch coloring interaction**: `color` is set when `hasSchedule && record?.branchId`. Since `source === "override"` implies `record.startMinute != null` (hasSchedule=true), a day with branchId set will have `color` defined. The if/else chain checks `color` BEFORE `effectiveHours?.source === "override"` (lines 306–316), so override WITH branchId uses `branchCellClass` instead of `bg-primary/10`. This is intentional: branch-colored cells are always more specific. The visual distinction from template is preserved: branch-colored cell + bold text vs. neutral card bg + italic muted text.
- **Text display** (line 340–343): `effectiveHours?.source === "override"` → `<div className="mt-0.5 text-[11px] font-semibold leading-none" ... text-primary or branchDotClass>`. `font-semibold` = bold. `text-primary` = colored. Spec requirement "primary bold" met.
- No regression: the override text block existed in the base commit (5cb44867); SCH-R-06 only adds the background tint.

---

## Clause 3 — closed source → «выходной» destructive styling

PASS

How verified:
- `resolveEffectiveHours` (line 151): `if (record.isClosed) return { source: "closed" }`. Note: this is an immediate return — `isClosed` takes priority over any `startMinute` value. No dual-state possible.
- **Cell background** (line 311–313 post-patch): `effectiveHours?.source === "closed"` → `bg-destructive/5 border-destructive/20 hover:bg-destructive/10`. `--destructive: hsl(0 55% 45%)` defined in `:root`. At 5% opacity: very subtle pink/red tint, distinct from neutral card. At 20% opacity border: clearly visible red border.
- **Text display** (line 350–352): `effectiveHours?.source === "closed"` → `<div className="mt-0.5 text-[10px] leading-none text-destructive/70">выходной</div>`. Russian label "выходной" rendered in 70% opacity destructive = readable muted red.
- **hasSchedule interaction**: closed days typically have `startMinute=null`, so `hasSchedule=false`, `color=undefined`. Even if `branchId` is set on a closed record, `color = hasSchedule && branchId` = false (hasSchedule=false). So closed state always hits the `closed` branch, not the `color` branch. No masking.
- **Edge case: closed + branch**: as above, color is gated on hasSchedule. Closed state is reliably applied.

---

## Clause 4 — CSS classes exist and resolve correctly in Tailwind v4

PASS

How verified:
- `tailwind-engine.css` uses `@import "tailwindcss"` (v4), `@theme inline` block, and explicit CSS custom properties in `:root`.
- All semantic tokens used by SCH-R-06:
  - `--primary: hsl(215 35% 40%)` → `--color-primary: var(--primary)` → `bg-primary/10`, `border-primary/30`, `hover:bg-primary/15` all valid Tailwind v4 opacity-modifier syntax.
  - `--destructive: hsl(0 55% 45%)` → `--color-destructive: var(--destructive)` → `bg-destructive/5`, `border-destructive/20`, `hover:bg-destructive/10` all valid.
  - `--muted-foreground: hsl(220 9% 46%)` → `text-muted-foreground` valid.
- Dark mode: `--primary: hsl(215 38% 58%)` in `.dark` (brighter blue in dark mode). `--destructive: oklch(0.62 0.16 25)` in `.dark`. Both ensure contrast is maintained.
- No custom CSS classes invented — all standard Tailwind v4 utility classes with standard design-system tokens.

---

## Clause 5 — No regression to existing DayCell behavior

PASS

How verified:
- The SCH-R-06 commit diff (`git show 025bdcc0`) is +7/-1 lines, entirely additive except for the font size change.
- If/else chain priority order (unchanged): `isSelected` → `isToday` → `color` → `override` (NEW) → `closed` (NEW) → `else` (default). The two new branches are inserted after `color` and before the final `else`.
- Pre-existing behavior for `isSelected`, `isToday`, and `color` (branch-colored days) is unaffected — they still take priority.
- The fallback `else` branch (`bg-card border-border hover:bg-muted/30`) still handles: null effectiveHours (unscheduled day with no weekday template), and template source (which doesn't match override or closed).
- Backward-compat block preserved (line 354–358): `{!effectiveHours && hasSchedule && ...}` renders time for old callers that don't pass `effectiveHours`. This is unchanged.
- TypeScript: base branch tsc passes with rc=0. The 2 new conditions use `effectiveHours?.source` with optional chaining — type-safe. No new TS constructs introduced.

---

## Clause 6 — Branch topology: stale base → merge regression risk

FAIL

How verified:
- `git merge-base feat/doctor-ui-rebuild auto/sch-r-06` = `5cb44867` — 2 commits BEFORE the current tip of `feat/doctor-ui-rebuild`.
- `feat/doctor-ui-rebuild` has `947f6f59` (SCH-R-04+08: weekday template checkbox, `handleSaveWeekdayTemplate`, `handleClearWeekdayTemplate`, `weekdayPermanent`, `WD_LABEL`, `loadWorkingHours` in `run()`) and `9ea67baa` (QW-A3: icon row in PatientInstanceStageItemCard) that are NOT in `auto/sch-r-06`.
- Merging `auto/sch-r-06` into `feat/doctor-ui-rebuild` will generate a merge conflict or, if fast-forwarded, will REVERT:
  - All SCH-R-04+08 features (already audited and PASSED)
  - QW-A3 icon row features (already audited, FAIL but in progress)
- **The branch must be rebased onto `feat/doctor-ui-rebuild` before merge.**

Defect location: branch creation point. Fix: `git rebase feat/doctor-ui-rebuild` on `auto/sch-r-06`, resolve any conflicts in ScheduleWorkTab.tsx (the only file changed by 025bdcc0), then re-audit.

---

## Clause 7 — DoD screenshot: 3 visual states visible

RENDER-CONFIRM-NEEDED

How verified:
- Code analysis confirms 3 states produce distinct visual output:
  - **template**: neutral white cell + small italic muted `~9–18` text — visually looks like a "soft hint"
  - **override** (no branch): steel-blue 10% tint cell + bold blue `9–18` text — clearly scheduled
  - **closed**: pink/red 5% tint cell + red border + muted red `выходной` label — clearly day off
- The DoD requires "screenshot shows 3 visual states" — cannot be confirmed without running the app.
- Given the code is correct and CSS tokens resolve to proper values, this is a render-confirm-needed (not a FAIL). A visual pass requires one screenshot showing a month with all 3 state types visible.

---

## Issues Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | **HIGH** | Branch `auto/sch-r-06` was created from stale base `5cb44867`, 2 commits behind `feat/doctor-ui-rebuild`. Merging will revert SCH-R-04+08 (weekday template checkbox) and QW-A3 (icon row). Must rebase before merge. |
| 2 | Low | Template cells have no background tint (neutral card). If the spec intended a subtle tint for template (e.g., `bg-muted/20`), this is a gap. Current reading of spec ("muted italic text") does not require a tint. |
| 3 | Info | Override with branchId shows branch color (blue/green/violet/orange) instead of primary blue. This is pre-existing behavior (color takes priority in the if/else chain). Three-state distinction is still preserved. |

---

## OVERALL: FAIL

**Reason: Clause 6 — stale branch base.** The SCH-R-06 implementation itself (commit `025bdcc0`) is correct: background tints are properly added for override and closed states, template has distinct italic muted text, CSS tokens resolve to valid values, and no regression is introduced within the commit's own scope. However, the branch was cut from a pre-SCH-R-04 commit and must be rebased onto `feat/doctor-ui-rebuild` before it is safe to merge. As-is, merging would silently revert two already-audited features.

**Fix required**: `cd /home/dev/dev-projects/BersonCareBot && git checkout auto/sch-r-06 && git rebase feat/doctor-ui-rebuild` — resolve any conflict in `ScheduleWorkTab.tsx` (the diff is additive: 2 elif branches + 1 font-size change, so conflicts should be minimal or zero since SCH-R-04 added in different lines).
