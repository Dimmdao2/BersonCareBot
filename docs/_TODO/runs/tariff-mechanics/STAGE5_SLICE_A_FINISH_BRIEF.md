# MISSION: finish the interrupted slice-A correction and prove it — continuation, not a new round

The previous pass did the work across 49 files but ran out of time before committing or proving anything. The lead
salvage-committed it as `692e00f05`. **In that state the tree is red.** Your job is narrow: make it green, then prove the
guards actually hold.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **What you are finishing:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX2_BRIEF.md` (the requirements) and the
  audit that drove it, `STAGE5_SLICE_A_REAUDIT_RESULT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §5.1 (block creating and changing, never reading), §5.6, §7.

## Two concrete failures to close

1. `pnpm --filter webapp typecheck` → `TS2339` at `src/app/app/patient/reminders/actions.ts:104`: `message` does not
   exist on one branch of the gate result union. Narrow it properly — do not cast, do not widen the type of the gate.
2. `src/app/api/tariffMechanics.route.test.ts` → the case «refuses every patient warmup-reminder write while warmups are
   off» fails. Either the guard is missing on one of those write paths, or the test expects the wrong shape. Decide which,
   fix the real cause, and say in your report which it was.

## Then prove it — this is the part the previous pass never reached

Remove each protection below by hand, run the test that is supposed to catch it, confirm it goes **red**, then restore the
code and confirm green again. Report the exact failure you saw each time:

1. the lazy `ensure*` upsert that used to create diary rows when a read path opens the page;
2. the doctor PATCH on a patient's LFK diary row;
3. the patient-home writes for `daily_warmup`.

A protection whose test stays green when removed is not a protection — report it as such instead of quietly leaving it.

## Constraints

- Close only the two failures above and the three proofs. No new scope, no refactoring, no new mechanics.
- Never gate reading. Never delete or hide existing data.
- Do not touch: the registry key list, migration `0275`, the seat chokepoint, the file write port, billing, the support
  system, the patient card, the patient app, treatment-program and LFK templates. Do not edit the plan file.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, the affected test files. **No full CI.**
- Never `git add -A`. Commit in this clone; no push, no merge.

## Report

`what was red → what you changed (file:line) → typecheck/lint/test results you actually saw → the three sensitivity
checks with the exact failure text each produced`. If any of the three did not go red, say so first, plainly.
