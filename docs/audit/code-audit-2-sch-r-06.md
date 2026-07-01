# Code Audit 2 — SCH-R-06
agentId: audit2-sch-r-06b
Commit: 41103aa2 (cherry-pick of 025bdcc0 onto feat/doctor-ui-rebuild)
Date: 2026-06-19

---

## Context

This audit evaluates commit `41103aa2` in `feat/doctor-ui-rebuild`, which is the properly cherry-picked SCH-R-06 change. Unlike the original `auto/sch-r-06` branch (audited in code-audit-1), this commit sits correctly on top of SCH-R-04+08 (947f6f59) and QW-A3 (9ea67baa). The stale-branch topology FAIL from audit-1 is RESOLVED here.

---

## Clause 1 — template source: muted italic text

PASS

How verified:
- `resolveEffectiveHours` (lines 143–161): returns `{ source: "template", startMinute, endMinute }` when no day record exists (or record has null startMinute and isClosed=false) AND `workingHours` has an active row for the date's weekday.
- DayCell JSX (line 344–347): `effectiveHours?.source === "template"` renders `<div className="mt-0.5 text-[10px] leading-none italic text-muted-foreground">~{formatHourRange(...)}</div>`.
- `italic` = Tailwind utility applying `font-style: italic` — confirmed present.
- `text-muted-foreground`: `--muted-foreground: hsl(220 9% 46%)` in `:root` of `tailwind-engine.css` (line 29); mapped via `--color-muted-foreground: var(--muted-foreground)` in `@theme inline` (line 78). Resolves to a grey tone — visually muted. ✓
- Font size changed from `text-[11px]` to `text-[10px]` in this commit — makes template text smaller than override text (11px), reinforcing secondary/fallback visual hierarchy.
- Cell background for template: falls to `else` branch → `bg-card border-border hover:bg-muted/30` (neutral). DoD says "muted italic text" only; no background tint required. ✓
- `startMinute` and `endMinute` are typed `number` (non-nullable) in the template branch of `EffectiveHours`, so `formatHourRange` always receives valid values. No null risk.
- `~` prefix distinguishes template time hint from a manually-saved override.

---

## Clause 2 — override source: primary bold styling + cell background tint

PASS (with documented note on branch-colored override)

How verified:
- `resolveEffectiveHours` (lines 150–153): `{ source: "override", startMinute, endMinute }` returned when `record.isClosed=false` AND `record.startMinute != null`.
- **Cell background** (lines 307–309): `effectiveHours?.source === "override"` → `bg-primary/10 border-primary/30 hover:bg-primary/15`.
  - `--primary: hsl(215 35% 40%)` (light) / `hsl(215 38% 58%)` (dark) in `tailwind-engine.css` (lines 24, 109).
  - Mapped via `--color-primary: var(--primary)` (line 83). Tailwind v4.3 `bg-primary/10` uses CSS `color-mix()` internally. ✓
  - This branch fires ONLY when `color` is undefined (no branchId on the record). See below for interaction.
- **Branch color interaction**: `color = hasSchedule && record?.branchId ? getBranchColor(...)`. If record has branchId set, `color` is defined and takes priority in the if/else chain (line 305 fires before line 307). A branch-colored override cell shows the branch tint, not the primary blue. This is pre-existing behavior, not a regression. Three-state visual distinction is maintained via text style regardless: override always shows `font-semibold` time text in `text-primary` or `branchDotClass`.
- **Text display** (lines 339–343): `effectiveHours.source === "override"` → `<div className="mt-0.5 text-[11px] font-semibold leading-none" ...>`. `font-semibold` = bold. Text color is `text-primary` when no branch color, or `branchDotClass(color)` when branch present. ✓
- `startMinute != null` guard on the JSX block (line 339) ensures safe render.

---

## Clause 3 — closed source: «выходной» destructive styling

PASS

How verified:
- `resolveEffectiveHours` (line 150): `if (record.isClosed) return { source: "closed" }` — immediate return, takes priority over startMinute check. No dual-state possible at the type/logic level.
- **Cell background** (lines 310–312): `effectiveHours?.source === "closed"` → `bg-destructive/5 border-destructive/20 hover:bg-destructive/10`.
  - `--destructive: hsl(0 55% 45%)` (light) / `oklch(0.62 0.16 25)` (dark) defined in `tailwind-engine.css` (lines 32, 117).
  - Mapped via `--color-destructive: var(--destructive)` (line 75). At 5% opacity: subtle pink/red tint; at 20% border: visibly red border. ✓
- **Text display** (lines 349–351): `effectiveHours.source === "closed"` → `<div className="mt-0.5 text-[10px] leading-none text-destructive/70">выходной</div>`. Russian label in 70% opacity destructive = muted red. ✓
- **Interaction with color branch**: `closeWorkingDays` in `pgBookingScheduling.ts` (lines 606–631) always sets `branch_id = NULL` and `start_minute = NULL` when writing a closed day. Therefore `hasSchedule = record?.startMinute != null` = false, and `color = hasSchedule && branchId` = false for any closed record. The `color` branch never fires for a closed cell in production. ✓
- **Interaction with §3.15 test**: The existing test at line 174 asserts `queryByText("выходной").not.toBeInTheDocument()`. This test's mock data (WORKING_DAY_ROWS) contains no `isClosed: true` record, so `resolveEffectiveHours` never returns `source: "closed"`, and no "выходной" text is rendered during that test. The test still passes. No regression. ✓

---

## Clause 4 — CSS tokens resolve correctly in Tailwind v4

PASS

How verified:
- `postcss.config.mjs` uses `@tailwindcss/postcss` v4.3.0 (package.json lines 114, 132). Tailwind v4 confirmed.
- `tailwind-engine.css` structure: `@import "tailwindcss"` → `@theme inline { --color-primary: var(--primary); --color-destructive: var(--destructive); --color-muted-foreground: var(--muted-foreground); }` → CSS custom properties in `:root` and `.dark`.
- All utility classes used by SCH-R-06 are standard Tailwind v4 opacity-modifier syntax over theme tokens:
  - `bg-primary/10`, `border-primary/30`, `hover:bg-primary/15` → `--color-primary` ✓
  - `bg-destructive/5`, `border-destructive/20`, `hover:bg-destructive/10` → `--color-destructive` ✓
  - `text-muted-foreground` → `--color-muted-foreground` ✓
- Dark mode tokens properly defined in `.dark` block with separate values (lines 109, 117).
- No invented utility classes. All are JIT-generated from the design-system token layer.

---

## Clause 5 — No regression to existing DayCell behavior

PASS

How verified:
- Diff: 7 insertions, 1 deletion — entirely additive except font-size change.
- If/else chain ordering preserved and extended (lines 300–315):
  1. `isSelected` → `bg-primary/15 ring` (highest priority, unchanged)
  2. `isToday` → `bg-emerald-500/10` (unchanged)
  3. `color` → `branchCellClass()` (unchanged)
  4. `effectiveHours?.source === "override"` (NEW — fires only when no color/isToday/isSelected)
  5. `effectiveHours?.source === "closed"` (NEW — fires only when above don't match)
  6. `else` → `bg-card border-border` (unchanged default)
- New branches are correctly placed after `color` and before `else`. Priority of existing branches is unaffected.
- `effectiveHours` prop is optional (`effectiveHours?: EffectiveHours`). When undefined or null, `effectiveHours?.source` evaluates to `undefined`, no new branch fires, falls through to `else`. ✓
- Backward-compat block (lines 352–357): `{!effectiveHours && hasSchedule && ...}` unchanged. ✓
- Date number rendering (line 336): unchanged logic. ✓
- Branch topology: `41103aa2` is committed directly on top of `feat/doctor-ui-rebuild` (after SCH-R-04+08 at `947f6f59` and QW-A3 at `9ea67baa`). The stale-base issue from audit-1's Clause 6 is resolved. All prior features intact.

---

## Clause 6 — Branch topology (cherry-pick correctness)

PASS

How verified:
- `git log --oneline feat/doctor-ui-rebuild`: `41103aa2` appears at position 2 in history (after `3a1125e1 SCH-R-05`), after `9ea67baa` (QW-A3) and `947f6f59` (SCH-R-04+08). ✓
- The cherry-pick correctly landed SCH-R-06 on the current branch tip without reverting any prior feature.
- Commit message matches original intent and includes correct author attribution.

---

## Clause 7 — Mutual exclusivity of 3 source conditions

PASS

How verified:
- `EffectiveHours` type (lines 81–85) is a tagged union discriminated by `source`. Exactly one branch of the union is active at runtime; TypeScript enforces this at call sites.
- `resolveEffectiveHours` has a strict priority order: (1) isClosed check → returns `closed`, (2) startMinute!=null check → returns `override`, (3) weekday template match → returns `template`, (4) fallback → `null`. These are mutually exclusive via early return statements; no two can fire simultaneously for the same record.
- DayCell JSX uses `effectiveHours?.source === X` pattern in independent `{...}` blocks — each conditional independently reads `source`. Since `source` is a single discriminant string, at most one `source === X` is true per render cycle. No double-render risk.

---

## Clause 8 — DoD screenshot: 3 visual states visible

RENDER-CONFIRM-NEEDED

How verified:
- Code analysis confirms all 3 states produce distinct visual output:
  - **template**: neutral white card + small `~9–18` text in italic muted grey
  - **override** (no branch): steel-blue 10% tint cell + bold blue `9–18` text
  - **closed**: pink/red 5% tint + red border + muted red `выходной` label
- DoD requires "screenshot shows 3 visual states." This cannot be confirmed without running the app.
- All code paths, CSS tokens, and token mappings check out. Visual render-confirm is procedural.

---

## Issues Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | Info | Override cells with a branchId show branch color tint (blue/green/violet) instead of primary blue. Bold text with `text-primary` still present. Three-state distinction preserved at the text level. Pre-existing behavior, not a regression. |
| 2 | Info | Template cells have no special background (neutral card). Spec says "muted italic text" only — no tint required. Consistent with current reading. |

No blocking issues found.

---

## OVERALL: PASS

The SCH-R-06 implementation in commit `41103aa2` (cherry-pick onto `feat/doctor-ui-rebuild`) is correct:
- All 3 source states produce visually distinct styling via distinct CSS utility classes
- CSS tokens (`--primary`, `--destructive`, `--muted-foreground`) are properly defined for both light and dark mode
- Source conditions are mutually exclusive at both the type level and runtime
- Existing DayCell priority chain (`isSelected` → `isToday` → `color` → new branches → default) is intact and unaffected
- The stale-branch topology issue from audit-1 is resolved by the cherry-pick onto `feat/doctor-ui-rebuild`
- The §3.15 test ("выходной" absent) still passes because the test mock has no isClosed=true records

Remaining gate: RENDER-CONFIRM-NEEDED (visual screenshot showing all 3 states in a real calendar month).
