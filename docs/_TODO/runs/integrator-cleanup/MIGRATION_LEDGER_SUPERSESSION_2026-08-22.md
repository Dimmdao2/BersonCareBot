# Migration ledger supersession — 2026-08-22

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/7a; bounded worker brief dated 2026-08-22.

## Result

The applied-migration guard now folds object creation and removal in migration filename order. A removal retires only an object created by an earlier migration when the removing migration is also applied. Pending removals and removals ordered before a later creation do not weaken the expectation.

Functions are tracked by full PostgreSQL identity, not by name alone. This matters for overloads and for PostgreSQL aliases such as `timestamptz` / `timestamp with time zone`: dropping one overload cannot hide another missing overload. Catalog checks use `to_regprocedure(identity)`, so the error names the exact missing signature.

Creation and removal classification remain in the single `migration-order.mjs` pass used by the guard. The unused parallel parser `migrate-local-objects.mjs` and its source-parser tests were removed.

The failure advice remains `--reapply <creator>` only for an object still promised after the ordered fold. A legally superseded object never reaches the failure or its harmful advice.

## Behavioral proof

Command:

```text
node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs
```

Result: exit 0; 57 tests, 57 passed, 0 failed. The spawned real guard is green for an applied creator followed by an applied drop, and red with `--reapply` for the same creator when the drop is pending or absent. It is also red when the drop precedes the creator or names another overload.

Regression injection: the drop effects were temporarily disabled in `collectExpectedObjects`, then this behavioral test was run:

```text
node --test --test-name-pattern='applied later migration can retire' deploy/postgres/privileges/migrate-local.test.mjs
```

Result: exit 1. The spawned guard reported the early function absent and emitted the harmful `--reapply 20260820T000100_first` advice. The mutation was reverted; the complete targeted command above then returned 57/57 green.

## Named DEV proof

No `--execute` command was run.

The exact migration-ledger and catalog query, followed by a direct-drop injection inside one transaction, was:

```text
sudo -u postgres psql --dbname=bcb_webapp_dev --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align <<'SQL'
SELECT tag
FROM drizzle.__drizzle_migrations
WHERE tag IN (
  '20260822T130000_the_integrator_roots_name_the_integrator_role',
  '20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine'
)
ORDER BY tag;
SELECT
  to_regprocedure('app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)') IS NULL AS retired_object_absent,
  to_regprocedure('app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)') IS NOT NULL AS replacement_present;
BEGIN;
DROP FUNCTION app.record_collapsing_audit_event(text,uuid,uuid,text,text,text);
SELECT to_regprocedure('app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)') IS NOT NULL AS guard_probe_after_direct_drop;
ROLLBACK;
SELECT to_regprocedure('app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)') IS NOT NULL AS restored_after_rollback;
SQL
```

The SQL selected both relevant ledger tags, probed the old and replacement identities, ran `BEGIN; DROP FUNCTION app.record_collapsing_audit_event(text,uuid,uuid,text,text,text);`, probed the same catalog oracle, ran `ROLLBACK`, and probed again. Result: both migration tags were present; `retired_object_absent|replacement_present` was `t|t`; the guard probe after the direct drop was `f`; after rollback it was `t`. The DEV object was restored by the same transaction.

The owner migrator entry point was then exercised without applying anything:

```text
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
```

Result: exit 1 with exactly one missing migration object:

```text
function app.enroll_current_patient_in_public_booking_clinic(uuid)
from 20260819T170216_a_public_visitor_becomes_a_client_when_identified
```

The superseded `app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)` no longer appears. The remaining failure is a separate real DEV catalog hole: no later applied migration drops that exact signature, so the guard correctly stays red and its `--reapply` advice remains applicable. This is the named blocker for DEV convergence outside this brief.

The host wrapper preflight was also attempted without `--execute`:

```text
bash deploy/host/migrate-dev.sh --preflight
```

It stopped before database work with `FATAL: DEV API env path guard failed`; the documented direct owner migrator invocation above supplied the guard evidence.

## Validation

- `node --check deploy/postgres/privileges/migration-order.mjs && node --check deploy/postgres/privileges/migration-order.test.mjs && node --check deploy/postgres/privileges/migrate-local.test.mjs && git diff --check` — exit 0.
- `pnpm install --offline --frozen-lockfile` — exit 0; restored this worktree's missing dependencies from the local pnpm store without changing the lockfile.
- `pnpm run typecheck` — exit 0.
- `pnpm exec eslint deploy/postgres/privileges/migration-order.mjs deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs` — exit 0.

Not run by scope: `--execute`, TEST, deployment, push, full CI, PROD.
