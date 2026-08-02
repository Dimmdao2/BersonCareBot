# Track D D30-P1 — saved-oracle fixer report

Authority: Р-D30 in `WORK_ORDER.md`, `TRACK_D_D30_SPECIALIST_TASK_SCHEDULING_BRIEF.md`, and the fixed oracle
`D30_SPECIALIST_TASK_INDEPENDENT_AUDIT_2026-08-03.md` at `3c61983bc`.

## Fixed findings

1. Temporary migration `9999_d30_specialist_task_delivery_queue_local.sql` retains the D5/D21 canonical
   `reminder_dispatch` join: `integrator.user_reminder_occurrences.rule_id` joins
   `public.reminder_rules.integrator_rule_id`.
2. `schedulerDecisionGuard` now detects the saved arithmetic, `let`/alias, Russian concatenation,
   dot/bracket assignment, `.includes()` and non-`sql` tagged-template fixtures. Its intentional imported
   re-export boundary remains explicit and unchanged.
3. Specialist-task event IDs include a deterministic title/description revision. An edit at the same
   `remind_at` therefore enqueues the replacement intent and terminalizes the old `processing` row through the
   existing single queue port; repeated producer/tick calls for unchanged content retain the same event ID.
4. `prepareReminderDeliveries.test.ts` no longer passes nullable `remindAt` to `encodeURIComponent`.

## Validation

- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts` — PASS, `12` tests.
- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts` — PASS, `9` tests.
- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/ src/infra/runtime/worker/ src/infra/db/repos/outgoingDeliveryQueue` — PASS, `51` tests (`3` skipped).
- `cd apps/webapp && node_modules/.bin/vitest run src/modules/specialist-tasks/` — PASS, `3` tests.
- Disposable PostgreSQL 16 (`initdb -A trust`, unix-socket only) — PASS: canonical `public.reminder_rules` scope resolves tenant; an old `processing` payload becomes `dead` while the same-due replacement remains `pending`. The audit-only script was removed after the run; no DEV/TEST/PROD database was used.
- `cd apps/integrator && node_modules/.bin/tsc --noEmit`; `cd apps/webapp && node_modules/.bin/tsc --noEmit` — PASS.
- Scoped ESLint for the D30 integrator and webapp source sets — PASS.
- `cd apps/integrator && node ../../scripts/check-queue-port-boundary.mjs` — PASS.
- `cd apps/integrator && pnpm run check:d30-scheduler-lock-concurrency`; `cd apps/integrator && pnpm run check:d30-outgoing-delivery-claim-concurrency` — PASS.
- `cd apps/webapp && bash scripts/check-drizzle-journal-sync.sh`; `cd apps/webapp && node ../../scripts/check-no-new-raw-sql.mjs`; `git diff --check` — PASS.

`9999` remains outside the Drizzle journal; final migration number, journal entry and removal of the temporary
journal-sync exception remain land-time work for root against current `feat`.
