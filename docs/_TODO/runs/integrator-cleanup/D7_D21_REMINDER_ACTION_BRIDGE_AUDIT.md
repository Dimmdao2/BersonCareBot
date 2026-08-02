# D7/D21 reminder action bridge audit

Date: 2026-08-02
Product SHA: `6fdc15670` (`wt/trackd-reminder-actions`)

## Authority and method

- Authority: `docs/_TODO/runs/briefs/TRACK_D_REMINDER_ACTIONS_PRODUCT_BRIDGE_BRIEF.md`; D7 and D21 in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.
- Method: recurring security/product behavior → PostgreSQL acceptance, SQL/ACL/diff inspection, and one fault injection for each independent class.

## Kill-set

Derived from authority before the detailed acceptance-file review:

1. A signed snooze updates canonical history/journal and the exact operational occurrence atomically.
2. A foreign organization or actor cannot mutate or reveal the occurrence.
3. A replay returns the first canonical deadline and neither writes another journal row nor moves the occurrence again.
4. If the operational occurrence is absent, the canonical mutation and journal remain absent.
5. Runtime roles have capability EXECUTE only; `app_patient` and `PUBLIC` have no table privilege on `integrator.user_reminder_occurrences`.
6. Applied migration `0314` is unchanged; the bridge is forward-only `0321`.
7. `done`/`skip` are not due after delivery, and mute excludes a past planned occurrence from the due predicate.
8. D5 remains canonical: the scheduler reads `public.reminder_rules`, without restoring `integrator.user_reminder_rules` or HTTP projection routes.

Process note: the initial broad `git show` used to inspect the product change also emitted the changed acceptance-test
hunk before this file was created. The list above is authority-derived and all five independent mutable faults below
were run, but this pass must not be represented as a strictly blind first read of that hunk.

## Initial fixture result

The mandated PostgreSQL command initially failed in `beforeAll` with `42501` while inserting
`integrator.user_reminder_occurrences`: the fixture disabled RLS only for public tables. Its partial cleanup then
read an uninitialized `originalTimezoneSetting`. This is an acceptance-fixture defect, not a product verdict.

The audit fixture now also supplies only the existing host C4 prerequisite `GRANT USAGE ON SCHEMA integrator TO
app_owner`; migration `0321` remains responsible for the app-owner table grants. No runtime table grant was added.

## Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Atomic canonical + operational snooze | PASS | PostgreSQL acceptance: the public history deadline, `integrator.user_reminder_occurrences.planned_at`, status `planned`, and non-due state match; replacing `planned_at = snoozed_until` with `planned_at = planned_at` failed that assertion. |
| Exact actor / organization | PASS | Same acceptance includes a user actively enrolled in both organizations; replacing the signed-context organization with the occurrence organization returned the foreign snooze and failed the denial assertion. |
| Replay | PASS | A second signed callback returns the first deadline and leaves one journal row; disabling the early replay return changed the returned deadline and failed. |
| Missing operational row | PASS | A history-only fixture returns no result, no canonical `snoozed_until`, and no journal row; a temporary mutation allowing the history write and returning before the missing-operational exception failed. |
| Runtime ACL | PASS | Acceptance checks all SELECT/INSERT/UPDATE/DELETE privileges for `app_patient` and `PUBLIC`; a temporary `GRANT UPDATE ... TO app_patient` failed. The five capability functions are SECURITY DEFINER, app_owner-owned, app_patient-executable, and not PUBLIC. |
| `0314` immutable / `0321` forward-only | PASS | `git diff 6fdc15670^ 6fdc15670 -- apps/webapp/db/drizzle-migrations/0314_reminder_callback_capabilities.sql` produced no diff; `git diff --exit-code 6fdc15670 -- apps/webapp/db/drizzle-migrations/0321_reminder_callback_operational_occurrence.sql` passed after all injections were reverted. |
| done / skip / mute due semantics | PASS | PostgreSQL acceptance keeps delivered done/skip occurrences non-due and evaluates a past planned occurrence as non-due while canonical mute is active; temporarily persisting `NULL` rather than `p_muted_until` failed the mute assertion. The actual worker predicate is `o.status = 'planned'`, `o.planned_at <= now`, enabled `public.reminder_rules`, and `platform_users.reminder_muted_until` in `apps/integrator/src/infra/db/repos/reminders.ts`. |
| D5 canonical rule read | PASS | `apps/integrator/src/infra/db/repos/reminders.d5.test.ts` passed: no principal fails closed; exact organization, enabled, bot-linked canonical `public.reminder_rules` model is selected. Product diff has no integrator source change. |

## Commands run

- `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts --reporter verbose` — PASS, 8 tests.
- `pnpm --dir apps/integrator exec vitest run src/infra/adapters/remindersWritesPort.test.ts src/infra/db/repos/reminders.d5.test.ts src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts --reporter verbose` — PASS, 15 tests.
- `pnpm --dir apps/integrator typecheck` — PASS.
- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp exec eslint src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts` and `pnpm --dir apps/integrator exec eslint src/infra/adapters/remindersWritesPort.ts src/infra/db/repos/reminders.ts src/kernel/domain/executor/handlers/reminders.ts` — PASS.
- `node scripts/check-no-new-raw-sql.mjs` — PASS; `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS; `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` — PASS; `git diff --check` — PASS.

## Verdict

Product verdict: **PASS**. The audit commit contains only the repaired acceptance fixture and this report; no product
SQL or runtime/deployment state was changed. D7, D21, taskdb, `feat`, and all external environments remain untouched.
