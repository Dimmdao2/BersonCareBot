# Ledger supersession: pending retirement — 2026-08-22

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/7a; bounded fixer brief dated 2026-08-22.

## Result

The catalog guard now evaluates the schema state that the current transaction is scheduled to
produce. `migrate-local.mjs` derives the current `pending` set once, keeps migrations in canonical
filename order, and gives that set to the existing `collectExpectedObjects` fold in
`migration-order.mjs`.

An object created by an already-applied migration remains an expected catalog object unless a
migration in this same run either drops it or recreates it. A removal outside the supplied
`--drizzle-folder`/pending set cannot hide a catalog hole. Effect parsing remains solely in
`collectExpectedObjects`; no second removal registry was introduced.

## Behavioral proof

Command:

```text
node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs
```

The changed `migrate-local.test.mjs` cases assert both sides of the boundary:

- applied creator + absent object + pending later `DROP` in the run → guard is green and the
  pending drop reaches its transaction;
- the same drop placed outside the folder supplied to the run → guard is red, names the absent
  creator and emits `--reapply`;
- an applied object with no retiring migration remains red (existing guard case).

## Named DEV proof

No `--execute`, TEST, deployment, push, full CI, or PROD action was run.

The core guard was exercised against the named DEV database with the same rollback-only owner
migrator that `migrate-dev.sh --preflight` calls:

```text
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
```

It did not emit the former catalog-hole refusal for
`app.enroll_current_patient_in_public_booking_clinic(uuid)`. It entered the transaction and reached
the pending `DROP FUNCTION`; the rollback-only run then stopped at a separate pending statement
with `ERROR: permission denied for schema app`. Because the command is rollback-only, no migration
statement or ledger row was retained. This proves the target guard no longer blocks the pending
retirement; the later privilege failure remains outside this fixer scope.

Fault injection used the actual applied ledger and the guard's own
`collectExpectedObjects`/`renderObjectPresenceSql` oracle to select an applied function, then sent
the following generated transaction to DEV's PostgreSQL admin socket:

```sql
BEGIN;
DROP FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid,text) CASCADE;
SELECT 0 AS at,
       to_regprocedure('app.enroll_current_patient_in_public_booking_clinic(uuid,text)') IS NOT NULL AS present;
ROLLBACK;
```

Result: the probe returned `0\tf` after the direct drop, then the same transaction rolled back.
Thus a directly removed applied object still makes the catalog oracle red, and DEV retained no
fault-injection change.

## Validation

- `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs` — exit 0; 58 passed, 0 failed.
- `pnpm typecheck` — exit 0.
- `pnpm exec eslint deploy/postgres/privileges/migrate-local.mjs deploy/postgres/privileges/migration-order.mjs deploy/postgres/privileges/migrate-local.test.mjs` — exit 0.
- `git diff --check` — exit 0.
