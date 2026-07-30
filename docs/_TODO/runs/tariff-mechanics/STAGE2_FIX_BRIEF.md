# MISSION: correction of stage 2 — three defects from the dual audit

Two independent audits (Sol with tests, Opus structural) both returned FAIL on the same three points. Everything else in
stage 2 was confirmed correct — do not touch it.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, stage 2 and 3.1a/3.1b. Item 2.6c stays an
  open question to the owner — do not implement it.
- **Verdicts you are fixing:** `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_SOL_RESULT.md` and
  `AUDIT_STAGE2_OPUS_RESULT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a (the ladder), §5 (what each step means).

## Fix 1 — the migration will break the deploy

`0276_access_lifecycle_ladder_local.sql:37` runs `UPDATE integrator.system_settings`. That table was removed by the
canonical integrator migration and writing to it is banned by `.cursor/rules/system-settings-single-source.mdc`. The root
`pnpm migrate` applies integrator before webapp, so the reachable outcome is `relation "integrator.system_settings" does
not exist` and the deploy stops before the ladder schema exists.

Required: remove the historical `7/3/21` seed through the single canonical settings source, or drop that statement
entirely if the seed cannot be reached from webapp migrations. Say in your report which of the two you did and why. Keep
the migration forward-only and keep its temporary number `0276` — the lead assigns the final one at merge.

## Fix 2 — `терпение` never reaches the clinic

The resolver computes the warning and its date (`service.ts:235`), but the guard collapses the result to `{ ok: true }`
(`requireEntitlement.ts:44`) and the visibility adapter to a boolean, and nothing else consumes `resolution.warning`. So
with `graceDays > 0` the clinic gets full access and no warning — canon §5.2 and plan item 2.4 require the warning with
its date to be visible.

Required: carry the warning through to at least one real surface the clinic actually sees, and prove it by behaviour.
Do not invent wording beyond canon §7 (name what will happen and when) and do not invent numbers — the count and the date
come from the resolver.

## Fix 3 — the literal hunt missed a whole app

The search for remaining agent-chosen values covered `apps/webapp` only; `apps/integrator` was never searched. Repeat it
there — durations, thresholds, counts, terminal states, and any copy of the `7/3/21` ladder. Report what you found; if it
is clean, say so explicitly with the command you ran.

## Fix 4 — the three test blind spots

The Opus audit names three blind spots in the load-bearing tests (section «Test sensitivity»). Close them: each of those
code changes must make a test go red. Quote the three from the audit in your report so the next audit can check them off.

## Constraints

- Do not touch: billing (`SAAS_BILLING_PLAN.md`), the mock-payment routes, the plan and the canon, and anything stage 2
  already got right.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, exact `vitest run <file>`. **No full CI.**
- Never `git add -A`. Commit in this clone; no push, no merge. Live DEV migration is the lead's job — do not attempt it.

## Report

Per fix: `what was wrong → what you changed (file:line) → the test → what you saw when you removed the fix by hand`. For
fix 1 also state explicitly why the chosen route cannot break an existing organization.
