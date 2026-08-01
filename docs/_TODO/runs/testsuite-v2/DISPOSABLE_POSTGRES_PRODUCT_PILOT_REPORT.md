# Disposable PostgreSQL product pilot — Б1/Б3 (#1081)

Date: 2026-08-02. Product base: `wt/disposable-pg-product-pilot`, descendant of accepted harness commit
`30411dbc4`; no DEV/TEST/PROD database, deploy, taskdb or push was used.

## Clean baseline before product edits

```text
TIMEFORMAT='elapsed_seconds=%3R' time pnpm run check:saas-a0-greenfield-baseline
```

Result: `exit=0`, `elapsed_seconds=10.507`; A0 census `tables=241`, `functions=196`, `policies=244`,
manifest `integrator=68`, `drizzle=288`, pending `integrator=0`, `drizzle=18`, test package `8/8`.

The first literal `pnpm run test:webapp:postgres` could not start because this fresh worktree had no
`node_modules` (`vitest: not found`, `exit=1`); after `pnpm install --frozen-lockfile` it exposed missing
workspace build outputs for `@bersoncare/db-principal` and `@bersoncare/operator-db-schema`. Those were built
without source edits. The first successful no-product-edit project run was:

```text
TIMEFORMAT='elapsed_seconds=%3R' time pnpm run test:webapp:postgres
```

Result: `2 files / 3 tests passed`, migration runner reported `count=306`, `exit=0`,
`elapsed_seconds=16.848`.

The current tail is included by that same template build: the A0 ledger ends at `288`, all `18` pending Drizzle
migrations replay through the real webapp migration runner, and its emitted total is `306`; the current file tail
is `apps/webapp/db/drizzle-migrations/0305_tariff_snapshot_access_doors_local.sql`.

## One product oracle

Moved only:

```text
apps/webapp/src/infra/repos/pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts
→ apps/webapp/src/infra/repos/pgEmailOtpPublicAtomicConsume.postgres.integration.test.ts
```

The replacement has no DEV/scratch database allowlist, no environment opt-in, and no new `pg.Pool.query` path.
It uses the existing webapp `getPool` / `startPoolTransaction` / `getWebappSqlFromPgClient` / Drizzle executor
path. The test holds the principal row in the first transaction, confirms that the second backend is blocked with
`pg_blocking_pids`, releases the first transaction, then asserts one successful consume, one `expired_code`, and
deletion of the challenge. Its fixture rows are removed in `finally`; the harness owns the file clone.

```text
pnpm --dir apps/webapp exec vitest list --config vitest.postgres.config.ts
find apps/webapp/src -name '*.postgres.integration.test.ts' -print | sort
find apps/webapp/src -name '*.postgres.integration.test.ts' -not -name 'pgDisposableHarness*' -print | sort
```

Result: list showed all four test cases including the product oracle; census is `3 total / 1 product`.

Final healthy execution:

```text
TIMEFORMAT='elapsed_seconds=%3R' time pnpm run test:webapp:postgres
```

Result: migration `count=306`; `3 files / 4 tests passed`, `exit=0`, `elapsed_seconds=16.127`.

## Named atomicity fault injection

The historical `0232_email_otp_atomic_consume.sql` was briefly changed first, but the run stayed green because
that migration is already represented in the A0 ledger and is not replayed. The file was restored immediately.
Changing A0 `schema.sql` instead was rejected before clone creation by the A0 hash gate (`schema_hash_drift`).

The effective one-shot mutation was therefore applied temporarily after baseline validation and after the
current migration tail, inside the disposable template only. With
`B1_ATOMIC_CONSUME_FAULT=read-then-delete`, the harness replaced
`app.email_otp_public_consume_latest_challenge` in that clone with an unsafe function that reads the challenge
without the principal/challenge locks, deletes it, ignores the delete result, and returns success. This is an
achievable read-then-delete race: both contenders can read, the second waits on the first delete, then also
returns success.

```text
TIMEFORMAT='elapsed_seconds=%3R' time B1_ATOMIC_CONSUME_FAULT=read-then-delete pnpm run test:webapp:postgres
```

Result: `exit=1`, `elapsed_seconds=17.050`; product oracle failed at its second-consume assertion — received
`{ ok: true, code: null, user_id: <fixture UUID> }` where it requires
`{ ok: false, code: 'expired_code', user_id: null }`; summary `1 failed / 2 passed files`,
`1 failed / 3 passed tests`.

The temporary harness override, schema attempt, and migration attempt were all removed before final validation:

```text
git diff -- apps/webapp/scripts/postgres-integration/harness-lib.ts \
  docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/schema.sql \
  apps/webapp/db/drizzle-migrations/0232_email_otp_atomic_consume.sql
```

Result: no output. No historical migration or production function change is committed.

## CI and scoped validation

`.github/workflows/ci.yml` now has the separate `test-webapp-postgres` job. It installs PostgreSQL 16 and executes
`pnpm run test:webapp:postgres`; the fast webapp shards remain unchanged.

```text
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint --no-ignore src/infra/repos/pgEmailOtpPublicAtomicConsume.postgres.integration.test.ts
node scripts/check-no-new-raw-sql.mjs
node scripts/check-test-runner-visibility.mjs
pnpm exec prettier --check .github/workflows/ci.yml
rg -n -A10 '^  test-webapp-postgres:' .github/workflows/ci.yml
git diff --check
```

Result: all `exit=0`. Raw-SQL gate reports `webapp manifest files: 21`; visibility reports
`webapp: disk=151, runner=130, invisible=21`, `OK`; Prettier parsed the YAML and the CI inspection shows both
`postgresql-16` installation and the project execution step.

## Registry correction

`TEST_SUITE_AUDIT_2026-07-29.md` now distinguishes the already-ready harness project/runner visibility from this
new CI execution, removes B2's false claim that the template cannot build, preserves A1/TEST as the V1/V9b RLS
contract, and keeps B3 open: this is exactly one of the 22 legacy DB-test files, not a mass transfer and not a
carry-over of `wt/testsuite-b` v1.
