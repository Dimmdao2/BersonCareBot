# MISSION: correction round 2 for stages 1–2 — one defect, fail-open on file volume

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, stages 1–2 (scope §1).
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §3 (classes), §5 (behaviour at the
  limit), §9 (rollout order — one mechanic at a time).
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_RESULT.md` — the single MUST FIX.

Four of the five previous fixes are confirmed. **Do not touch them.** One defect remains.

## The defect

A tariff is created with `quotas: {}`. The resolver then enables `files` unconditionally because it is not a
capability class, and the file POST path checks only that boolean before creating metadata and accepting the upload.
Result: a clinic whose tariff never configured a file limit uploads **without any finite ceiling** — a tariff limit is
bypassed and storage cost is unbounded. The same fail-open shape would be inherited by the `запас` class in stage 4,
so fix the shape, not just the one mechanic.

## What is required

**A numeric mechanic with no configured limit must not behave as unlimited.** Mirror the invariant that already exists
for seats: there the missing configuration falls back to a **finite** baseline, never to unlimited
(`MECHANIC_DEFAULT_*` / `resolveClinicSeatLimit`). Apply the same principle to `объём` and pre-emptively to `запас`, so
stage 4 inherits a fail-closed model.

Two constraints on how you do it:

1. **Do not invent a number as a product decision.** The owner sets all figures («сами цифры — тебя не касаются»).
   Either reuse the existing fail-closed baseline mechanism, or make the unconfigured state an explicit
   «limit not configured» that refuses growth and says so — your choice, but state in the report which invariant you
   relied on and why it does not smuggle in a made-up ceiling.
2. **Do not break organizations that run through the compatibility path** (no tariff assigned yet). The canon's rollout
   order is «show the numbers → find who is over → give them an override → then enforce» (§9). Legacy/compatibility
   resolution must keep its current behaviour; only an explicitly assigned tariff gets the fail-closed treatment.
   If you cannot separate those two paths cleanly, stop and say so — do not guess.

## Acceptance — behaviour, not code reading

- A tariff **with** a file limit: upload works up to the limit, refused beyond it.
- A tariff **without** a file limit: growth is refused (or capped by the existing finite baseline), and the refusal is
  visible — never a silent success.
- An organization on the compatibility path: behaviour unchanged.
- Existing files stay readable, downloadable and deletable in every case (canon §5.4).
- The test must go red if the fail-closed branch is removed. Prove it: delete the branch by hand, watch it fail,
  restore it. Report what you saw.

## Constraints unchanged

- Numbers stay in exactly two places after these stages: specialist seats and file volume. Do not create patients or
  branches — that is stage 4.
- Reads are never gated; mutations are.
- Targeted runs only (`pnpm --filter webapp typecheck`, `lint`, affected tests). **No full CI** — the lead runs it once
  at stage 7 under the shared lock.
- Keep the temporary migration number `0275`.
- Never `git add -A`. Commit in this clone; do not push, do not merge.
- DEV runtime probes stay with the lead in the canonical tree — do not fight the migration path guard.

## Report

`what was wrong → the invariant you used → files changed (file:line) → the test that guards it → what you saw when you
removed the branch by hand`. Anything left open: one line, no softening.
