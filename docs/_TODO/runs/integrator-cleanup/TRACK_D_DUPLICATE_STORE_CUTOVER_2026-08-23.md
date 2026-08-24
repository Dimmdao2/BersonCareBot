# Track D — duplicate-store cutover and retention

Current candidate: `wt/track-d-final-cutover-20260823`. Nothing from this candidate has been applied to
DEV, TEST or PROD. The exact candidate migration chain passed the canonical rollback-only preflight on
the named DEV database; all DDL, backfill and temporary owner changes ended in `ROLLBACK`.

## Owner oracle

- One business reminder rule creates one concrete occurrence per scheduled date/time.
- The occurrence row itself carries the lifecycle: planned, queued, retry timing after a failure, and sent
  only after real provider success.
- Delivery attempts are stored only for actual failures. A successful send is not duplicated into a second
  result journal.
- Scheduler and worker remain phases of the same resident integrator process; no new service is introduced.
- External messenger identifiers live in contact/channel bindings, never in an integrator identity mirror.
- Old technical journals and terminal queue rows are removed automatically by the existing retention sweep.

## Implemented cutover

`20260823T220000_consolidate_reminder_occurrence_stores.sql` makes
`public.reminder_occurrence_history` the single physical occurrence store.

The migration:

1. adds the operational lifecycle columns to that table;
2. enriches every existing finalized row from `integrator.user_reminder_occurrences`;
3. inserts the remaining planned/queued rows;
4. moves the only independent `done` facts from `public.reminder_journal` onto the occurrence row;
5. aborts before deletion unless row parity, required identities and occurrence-key uniqueness hold;
6. rewrites every reminder root to read and write the consolidated row;
7. drops `integrator.user_reminder_occurrences`, `public.reminder_journal` and the unused
   `integrator.direct_public_write_retries` store without `CASCADE`.

The data moves are `BCB-MIGRATION-BACKFILL` statements because the source and target are under FORCE RLS.
DDL and function bodies still execute as their declared stationary owners. Every replacement function is
given temporary schema `CREATE` only inside the migration transaction.

The integrator runtime now treats provider acceptance as the delivery boundary: it marks the delivery job
sent immediately after provider success and does not turn a later occurrence/bookkeeping failure into a
second provider send. Real failures alone increment attempts and schedule a retry.

The old direct-public projection retry worker, repository, fallback tests and projection keys are removed.
No replacement retry table or duplicate result journal is introduced.

## Pre-session overlay conflict

`deploy/postgres/organization-member-invites-rls.sql` no longer owns a second body for
`app.email_auth_find_email_challenge_for_confirm(uuid,uuid)`. The canonical body remains in the forward
migration and carries the exact pre-session gate.

DEV proved the historical overlay had left this function `postgres`-owned. PostgreSQL refuses
`CREATE OR REPLACE` by the declared seam owner in that state, so the migration runner now supports one
explicit marker, `BCB-MIGRATION-REHOME-FUNCTION`, which re-homes only the named existing signature inside
the same transaction before executing its replacement as the declared owner. The parser rejects unsafe
identities and a marker that does not accompany replacement of the same function.

This repairs the already-overwritten database without restoring the overlay body and prevents order-dependent
login behavior on DEV and TEST.

## Automatic retention

The existing retention chokepoint covers:

- expired public and integrator idempotency keys after the grace window;
- sent delivery jobs after the short operational window;
- dead delivery jobs and failed-attempt rows after the audit window;
- expired context nonces through its existing separately owned root.

Pending, processing and retryable work is never selected by those terminal-state retention targets. The
maintenance job uses the existing internal-job and operator-health mechanisms; no second scheduler exists.

## Migration privilege analysis

- Table alterations, indexes and destructive drops run as `app_object_owner`.
- Data copy and parity checks run as local-admin backfills inside the same migration transaction because FORCE
  RLS intentionally hides rows from stationary object owners.
- Reminder materialization roots run as `app_seam_reminder_materialization_owner`.
- Patient reminder actions run as `app_seam_reminder_patient_owner` or the existing patient self-action seam.
- Delivery scope resolution runs as `app_seam_delivery_scope_owner`.
- The pre-session forward repair runs as `app_seam_email_otp_owner`, after the exact existing signature is
  transactionally re-homed to that same role.
- Migrations contain no `GRANT`, `REVOKE`, policy or role changes. Permanent access remains generated from
  `deploy/postgres/privileges/declaration.ts` and its relation/function surfaces.

## Evidence

Exact live census before the cutover transaction:

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -X -P pager=off -c "SELECT status, count(*) AS rows, count(*) FILTER (WHERE occurred_at IS NOT NULL) AS has_occurred, count(*) FILTER (WHERE created_at IS NOT NULL) AS has_created FROM public.reminder_occurrence_history GROUP BY status ORDER BY status; SELECT count(*) AS total, count(*) FILTER (WHERE o.id IS NOT NULL) AS matched_operational, count(*) FILTER (WHERE o.id IS NULL) AS history_only FROM public.reminder_occurrence_history h LEFT JOIN integrator.user_reminder_occurrences o ON o.id=h.integrator_occurrence_id;"
```

Result: every finalized history row matched an operational occurrence; no history-only row existed.

Canonical rollback-only candidate preflight:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

Result: PASS, pending migration chain executed against `bcb_webapp_dev`, data parity gate passed, old stores
were dropped inside the transaction, and the transaction ended in `ROLLBACK`.

Targeted gates on the current tree:

```bash
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/migrate-local.test.mjs
node --test deploy/postgres/privileges/migration-order.test.mjs
pnpm --dir apps/integrator typecheck
pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
pnpm --dir apps/webapp exec vitest --run src/infra/repos/pgReminderJournal.pg.test.ts src/infra/repos/pgReminderProjection.pg.test.ts
```

Results: migration runner/parser 41/41, migration order/static acceptance 24/24, both application typechecks
green, targeted webapp repository tests 13/13. The complete integrator suite was green before the subsequent
migration-runner-only correction; it is not claimed as evidence for that later correction.

## Remaining gates

1. Commit the candidate and run the required independent audit, including blind failure injection for
   duplicate-send prevention and inspection of the destructive parity gate.
2. Land only through the orchestration port after PASS.
3. Run the integration CI gate and apply/verify on DEV.
4. Deploy and verify on TEST only when the owner permits that timing. PROD remains out of scope.
