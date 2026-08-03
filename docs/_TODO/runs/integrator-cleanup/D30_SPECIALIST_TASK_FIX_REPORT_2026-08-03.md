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
3. Specialist-task event IDs now include a deterministic revision of the complete materialized provider `meta`
   (without `eventId`/`occurredAt`) and `payload`. A `dueAt`, recipient binding/email, channel payload, subject,
   URL or other delivered-value change at the same `remind_at` therefore enqueues the replacement intent and
   terminalizes the old `processing` row through the existing single queue port. A byte-identical replay keeps
   its ID. `description` is intentionally not revisioned because it is not materialized in this reminder payload.
4. `prepareReminderDeliveries.test.ts` no longer passes nullable `remindAt` to `encodeURIComponent`.

## Validation

- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts` — PASS, `12` tests.
- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts` — PASS, `9` tests.
- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/ src/infra/runtime/worker/ src/infra/db/repos/outgoingDeliveryQueue` — PASS, `51` tests (`3` skipped).
- `pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/` — PASS, `3` tests. The new red-first
  assertion failed before the R2 implementation: a `dueAt` change at the same `remindAt` kept the old event ID.
  It now proves due-date, Telegram binding, and email recipient revisions, unchanged replay, and unchanged
  non-materialized `description`.
- Disposable PostgreSQL 16 (`initdb -A trust --no-locale --encoding=UTF8`, unix-socket only) — PASS: a real
  `createPgSpecialistTasksPort` write was claimed as `processing`; real `update(..., { dueAt })` changed the
  event ID, made the old row `dead`, and left the replacement `pending` with the new due-date payload. The
  audit-only script was removed after the run; no DEV/TEST/PROD database was used.
- `cd apps/integrator && node_modules/.bin/tsc --noEmit`; `cd apps/webapp && node_modules/.bin/tsc --noEmit` — PASS.
- Scoped ESLint for the D30 integrator and webapp source sets — PASS.
- `cd apps/integrator && node ../../scripts/check-queue-port-boundary.mjs` — PASS.
- `cd apps/integrator && pnpm run check:d30-scheduler-lock-concurrency`; `cd apps/integrator && pnpm run check:d30-outgoing-delivery-claim-concurrency` — PASS.
- `cd apps/webapp && bash scripts/check-drizzle-journal-sync.sh`; `cd apps/webapp && node ../../scripts/check-no-new-raw-sql.mjs`; `git diff --check` — PASS.

At land, root synchronized the accepted branch with current `feat`, renamed the temporary migration to
`0328_d30_specialist_task_delivery_queue_local.sql`, appended journal `idx=326` / `when=1793539230032`, and
removed the temporary `9999` journal-sync exception. DEV application and live delivery proof remain required
after the preceding `0323` repair succeeds; TEST/PROD are not part of this D30 application.

## Online-index landing correction

Root acceptance found that `0328_d30_specialist_task_delivery_queue_local.sql` placed
`CREATE INDEX CONCURRENTLY` inside a Drizzle migration even though the installed PostgreSQL dialect runs pending
migrations in `session.transaction(...)`. PostgreSQL therefore rejects the candidate before it can land.

The additive `organization_id` column and scope function remain in `0328`. The exact hot-table index now lives in
`deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql`: it runs as standalone
autocommit `psql`, removes only an invalid/unready residue of that exact index, creates it concurrently, and
asserts the final btree/non-unique/non-partial/expression-free three-key definition. `migrate-dev.sh --execute`,
`deploy-test.sh`, `deploy-test-saas.sh`, and `deploy-prod.sh` apply the version-matched artifact immediately after
Drizzle succeeds and before any service restart.

Validation in this correction:

- Red-first: `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --check-online-index-layout` rejected the
  original `0328`, and rejected a temporary post-fix reinjection, with
  `transaction_forbidden_concurrent_index migration=0328_d30_specialist_task_delivery_queue_local` (exit `1`).
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` and
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS.
- `bash -n deploy/host/migrate-dev.sh && bash -n deploy/host/deploy-test.sh && bash -n deploy/host/deploy-test-saas.sh && bash -n deploy/host/deploy-prod.sh`
  and the runner's offline SQL-shape/layout check — PASS.
- Existing D30 targeted tests: webapp `1` file / `3` tests; integrator `7` passed files / `51` passed tests
  (`1` file / `3` tests skipped). Both typechecks, scoped ESLint, raw-SQL and queue-boundary gates, both D30
  concurrency checks, and `git diff --check` — PASS.

No DEV, TEST, or PROD mutation was performed. D30 Ш3 remains open: DEV apply and live specialist-task delivery
proof are still pending.

## R2 command record

```bash
pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/integrator exec tsc --noEmit
pnpm --dir apps/webapp exec eslint src/modules/specialist-tasks/prepareReminderDeliveries.ts src/modules/specialist-tasks/prepareReminderDeliveries.test.ts
cd apps/integrator && pnpm exec eslint src/infra/db/repos/outgoingDeliveryQueue.ts src/infra/delivery/deliveryContract.ts src/infra/runtime/scheduler/schedulerDecisionGuard.ts src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.ts
cd apps/integrator && node ../../scripts/check-queue-port-boundary.mjs
cd apps/integrator && pnpm run check:d30-scheduler-lock-concurrency
cd apps/integrator && pnpm run check:d30-outgoing-delivery-claim-concurrency
cd apps/webapp && bash scripts/check-drizzle-journal-sync.sh
cd apps/webapp && node ../../scripts/check-no-new-raw-sql.mjs
git diff --check
```

The disposable-race invocation used `NODE_ENV=test USE_REAL_DATABASE=1` and a private PostgreSQL socket URL in
both `DATABASE_URL` and `D30_DISPOSABLE_DATABASE_URL`; the temporary TS harness was deleted immediately after
the PASS.
