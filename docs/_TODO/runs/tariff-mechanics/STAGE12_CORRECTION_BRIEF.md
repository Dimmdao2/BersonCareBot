# MISSION: correction round for stages 1–2 (commit `a678edc7e` failed independent audit)

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, stages 1 and 2 only. Scope boundaries in
  §1 were widened by the lead after audit finding 6 — the constructor API route, `system-settings/registry.ts` and the
  material-ratings / notification-templates routes are now inside the allowed scope.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §3, §4, §5.
- **Audit verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_RESULT.md` (FAIL, six findings).
- **Your previous report:** `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_REPORT.md`.

Finding 6 is already handled by the lead (plan defect, not yours). **Fix findings 1–5.** Do not touch anything else,
do not refactor beyond them, do not add plan items.

## Fix 1 — class `никогда` must not be a commercial switch at all (most important)

Today `emptyMechanics()` writes every key including the hidden ones as `false`, the full map reaches the API, and the
resolver honours the tariff boolean. Result: assigning such a tariff makes POST/PATCH of the patient card return
`entitlement_required` — the doctor cannot record visits, diagnoses or anamnesis. The owner explicitly forbade making
the patient card and the patient app controllable.

Required: a mechanic of class `никогда` resolves to enabled **always**, regardless of tariff, of an organization
override, or of a stored `false`. Ignoring it at the resolver is the point — a stored `false` must not be able to
disable it. Also do not write such keys into new tariffs.

**Acceptance (behaviour, not code reading):** a tariff whose stored map says `patient_card: false` must still allow the
patient-card mutation path. Prove it with a test that goes red if the resolver stops forcing the class on.

## Fix 2 — a new tariff must not disable the two numeric mechanics

`clinic_team` and `files` are excluded from the capability checkboxes but are created as boolean `false`, so
`resolveClinicSeatLimit` returns `0` and the file mutation guard refuses uploads. A freshly created tariff therefore
gives zero seats and no uploads until someone adds a manual override.

Required: the numeric classes (`места`, `объём`, and later `запас`) are enabled by their own configuration — a limit —
and are not silently switched off by an empty capability map. Choose the smallest fix consistent with the canon and say
in your report which invariant you relied on.

**Acceptance:** create a tariff through the real constructor path, assign it, and show that seats and file uploads work
per the configured limit. A test must go red if the empty-map behaviour comes back.

## Fix 3 — class `запас` must be declarable

`MechanicClass` lists `запас`, but `MechanicDefinition` unions only four shapes, so `{ class: 'запас', … }` does not
type-check. Stage 4 (number of patients, number of branches) cannot start on this. Add the missing shape: a number,
no period, unit consistent with the canon. Do not add the mechanics themselves — stage 4 does that.

**Acceptance:** a scratch declaration of a `запас` mechanic type-checks; an attempt to give it a period does not.

## Fix 4 — platform-wide off for material ratings must close every write

With `material_ratings_enabled=false` a patient can still POST rating feedback through `submitPatientFeedback`, and the
row is written. Close the whole write surface of the rating loop, not only the primary route.

**Acceptance:** each write path of the rating loop refuses when the setting is off; a test goes red if the check is
removed from any of them.

## Fix 5 — the gates must be proven by behaviour

Removing the guard from the course POST, from the notification-template PUT, or the `material_ratings_enabled` check
leaves both current service tests green. That means the tests do not guard what stages 2.2, 2.7 and 2.9 promise.

Required: for each of those three paths, a test that calls the real handler with the mechanic or setting off and expects
a refusal. Then prove each one: delete the guard by hand, watch the test go red, restore the guard. Report what you saw.
Do not assert on source text, do not add a new file where the area already has one.

## Constraints unchanged

- Numbers stay in exactly two places after these stages: specialist seats and file volume. Patients and branches come in
  stage 4 — do not create them.
- Never gate reading: a disabled mechanic blocks creating and changing; already created content stays visible and
  exportable.
- Targeted runs only (`pnpm --filter webapp typecheck`, `lint`, affected tests). **Do not run the full CI** — the lead
  runs it once at stage 7 through the shared lock.
- Keep the temporary migration number `0275`; the lead assigns the final one at merge.
- Never `git add -A`. Commit in this clone, do not push, do not merge.
- DEV runtime probes are blocked by the migration path guard in a clone — do not fight the guard. Where a proof needs a
  live DEV database, say so; the lead runs those in the canonical tree.

## Report

Per fix: `what was wrong → what you changed (file:line) → the test that now guards it → what you saw when you removed
the guard by hand`. Anything you could not close: say why, in one line, without softening.
