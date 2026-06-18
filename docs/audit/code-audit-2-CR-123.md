# code-audit-2 CR-123 — 2026-06-17 (OPUS-AUDITOR, independent 2nd pass)

## Verdict: CLEAN (mergeable) — with 2 non-blocking advisories

Independent audit formed before reading audit #1. All three CRs are correct,
type-checks pass, scope is contained, and the full test file is green (52/52).
Two advisories below do not block merge.

---

## Per-clause findings

| Clause | Result | Notes |
|--------|--------|-------|
| **1. CR-1 correctness** | PASS | `{...(view === "month" ? { dayCellContent: … } : {})}` removes the prop entirely in timeGrid views, so FullCalendar never calls it for column headers → kills the "1 Issue" dev-overlay error. In month view the custom day-number button is identical to before. `navLinks`/`navLinkDayClick` (line 1574) and `drillDownDay` wiring are untouched and sit *outside* the conditional spread, so the month day-number drill-down and the day-header drill-down both still work. No regression. |
| **2. CR-2 correctness** | PASS | Reads `calendarEvents` (the array fed to the *only* FullCalendar instance at line 1553; the other `events=` at 1448 is `ListView`, not FC — consistent). Half-open interval `start <= clickedMs < end` is correct (click exactly at start = blocked, exactly at end = allowed). `Array.isArray()` guards the loading state (when `!data`, `calendarEvents=[]` → `.some` returns false → click passes through, harmless). `ev.start && ev.end` guards undefined before `new Date(...)`. For nonworking events specifically, `start`/`end` are produced by `buildNonWorkingFillEvents` as `new Date(...).toISOString()` strings (lines 358–368) — always defined ISO strings, so `new Date(ev.start).getTime()` is safe and unambiguous. In month view `isTimeGrid=false` → `grayFill=[]` → no `kind:"nonworking"` events exist → guard is always false → month clicks unaffected. Works across all 4 views. |
| **3. CR-3 CSS validity** | PASS (advisory) | `oklch(from var(--primary) l c h / 0.18)` is CSS Relative Color Syntax (Color Level 5): Chrome/Edge 119+, Safari 16.4+, Firefox 128+ (all shipped well before 2026). Degrades gracefully: on an unsupported engine the declaration is dropped and the today-column header simply renders with the default/neutral background — purely cosmetic, no layout or functional impact. See advisory A1. |
| **4. oklch vs color-mix** | ADVISORY | Agree with audit #1 that it matters for *consistency*, and I add a stronger reason — see A1. Not a merge blocker. |
| **5. Tests adequacy** | PASS (advisory) | Two tests: working-area click (11:00 UTC / 14:00 MSK, inside 07:00–15:00 UTC shift) asserts panel opens; nonworking click (15:30 UTC / 18:30 MSK, inside the 15:00–16:00 UTC post-shift fill) asserts panel does NOT open and `right-panel-empty` stays. Both pass. Coverage is reasonable for the fix. Gap noted in advisory A2 (fragile wait + missing edge tests). |
| **6. Scope** | PASS | `git diff --stat feat/doctor-ui-rebuild...auto/cr-123` = exactly the 2 owned files (`ScheduleCalendarTab.tsx` +56/-31, `.test.tsx` +71). Only untracked `node_modules` in the worktree. EventPanel and all other files untouched. |
| **7. No regressions** | PASS | month-view day-number click → `drillDownDay` intact; `navLinkDayClick` intact; `eventClick`/`dateClick`/`select` paths unchanged except the new early-return guard prepended to `dateClick`. |
| **8. tsc** | PASS | `tsc --noEmit` on webapp: only error is pre-existing `integrator/.../normalizeToUtcInstant.ts: Cannot find module 'luxon'` (partial worktree node_modules, unrelated). No errors in `ScheduleCalendarTab`. The typed `arg: { date: Date }` in the conditional spread compiles cleanly. |
| **9. Tests run** | PASS | `vitest run ScheduleCalendarTab.test.tsx` → **52 passed, 0 failed**. CR-2 subset → 2 passed. |

---

## Advisories (non-blocking)

### A1 — CR-3 `oklch(from …)` should be normalized to `color-mix` (consistency + a documented prior failure)

This is the only use of CSS relative-color syntax in the entire webapp
(`grep oklch(from` → 1 hit). Everywhere else, primary/accent alpha tints use
`color-mix(in srgb|oklab, var(--token) N%, transparent)` — including a line
**~14 rows above** in the same `<style>` block (the today-circle, line 1520).

Stronger reason than "Level 5 vs Level 4 browser support": the same file already
carries an explicit warning comment (§3.10, lines 1509–1512):

> «ВАЖНО: тема в oklch, --primary вообще синий → используем emerald через
> color-mix(...), иначе цвет получался невалидным/прозрачным (today был не виден).»

i.e. the team previously hit an *invalid/transparent* result when leaning on the
`--primary` token directly and deliberately moved to `color-mix`. And in fact
`--primary` is defined as **`hsl(215 35% 40%)`** (tailwind-engine.css:24, dark
:109) — *not* oklch — so `oklch(from var(--primary) …)` relies on the engine's
hsl→oklch conversion path. It does work on all current target browsers (verified
syntactically valid; degrades to neutral header otherwise), so it is **acceptable
to merge as-is**. But the consistent, self-documented-safe form is:

```css
background-color: color-mix(in srgb, var(--primary) 18%, transparent) !important;
```

Recommend as a fast-follow (or a 1-line pre-merge swap if trivial). Not a blocker.

### A2 — CR-2 test wait is a no-op (fragile, passes by luck of microtask timing)

Both new tests use:

```js
await waitFor(() => screen.queryByTestId("right-panel-empty") !== null);
```

`waitFor` only retries when its callback **throws**; a callback that *returns*
`false` resolves on the first tick. So this line does **not** actually wait for
`data` to load — it resolves immediately. The negative test only passes because
the `userEvent.setup()` + `render()` + click sequence happens to flush enough
microtasks for `calendarEvents` to populate before the click fires. If load
timing ever shifts (slower mock, added await), the nonworking click could fire
while `calendarEvents` is still `[]`, the guard would be a no-op, the panel would
open, and the test would flip to a **false failure** (or, worse for the positive
test, a false pass that never exercised the loaded-data path).

Recommend asserting inside `waitFor` so it actually retries, e.g.:

```js
await waitFor(() => expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument());
```

Minor missing coverage (optional): boundary click exactly at fill `start`
(should block) and exactly at `end` (should allow); a break-zone click is not
covered (CR-2 only guards `kind === "nonworking"`, so a click inside a *break*
background event still opens the create panel — confirm that is intended).

---

## Comparison with audit #1

- **Agreements:** CR-1/CR-2 correctness, half-open interval, scope, tsc, 52/52,
  and the core `oklch`-vs-`color-mix` consistency point. Audit #1 is solid.
- **I add (audit #1 missed):**
  1. The ineffective `waitFor` in the new tests (A2) — audit #1 rated tests
     "PASS" with no reservation. The tests are *correct in outcome today* but
     *fragile in mechanism*.
  2. The `--primary` token is actually `hsl(...)` and the same file's §3.10
     comment documents a prior `--primary`/transparency failure — a sharper
     justification for A1 than browser-level alone.
- **No disagreement on the verdict direction.** Both audits converge on: ship it,
  the `oklch` line is acceptable but worth normalizing.

---

## Critical question — fix `oklch(...)` before merge?

**Acceptable as-is for merge.** It is valid CSS, works on all current target
browsers, and degrades to a cosmetic-only neutral header on anything older. Given
strong codebase precedent (§3.10) and one-line cost, normalizing to
`color-mix(in srgb, var(--primary) 18%, transparent)` is **recommended as a
fast-follow**, not a merge gate.
