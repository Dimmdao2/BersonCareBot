# Б1/Б3 — независимый аудит product-test disposable PostgreSQL (#1081)

Дата: 2026-08-02. Candidate: `wt/disposable-pg-product-pilot` at `378e3faeb` (product change
`6735dd2ae9cb24d9ebb00b82f952bbc7c6029f68`). Authority: `AGENTS.md` §1b.3/§5/§10/§24,
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` Б1/Б3 and
`docs/_TODO/runs/briefs/DISPOSABLE_POSTGRES_PRODUCT_PILOT_BRIEF.md`.

## Verdict

**PASS.** The pilot converts exactly one legacy live-DB test into the separate disposable
PostgreSQL project and gives its concurrency oracle a real red fault. No DEV, TEST, PROD,
deploy, taskdb, plan checkbox, or product fix was touched by this audit.

## Kill-set fixed before reading the new product test

| ID | Named failure to kill | Proof | Result |
| --- | --- | --- | --- |
| K1 | Ambient DEV URL reaches the product file | `vitest.postgres.setup.ts` clones and assigns `DATABASE_URL` at top level before test import, then queries `current_database()` and accepts only `pbt_*`. | KILLED by inspection and healthy execution. |
| K2 | Clone is created after a product import has read DB config | `setupFiles` top-level await runs before the test module; the product file creates its pool only inside `it`. | KILLED by inspection. |
| K3 | Two consumes are serial rather than contending on the principal-row lock, or synchronize with a sleep | First transaction locks `platform_users.id FOR UPDATE`; `pg_blocking_pids(secondPid)` is polled with `setImmediate`, then first commits. | KILLED by product runtime and named fault. |
| K4 | Both consumes succeed, or the second result is not `expired_code` | Clean run requires one `ok=true`; second is exactly `expired_code`. A read-then-delete override made the second `ok=true` and the oracle red. | KILLED. |
| K5 | The consumed challenge remains | Product assertion checks `email_challenges` by fixture id equals `0`; fixture rows are also removed in `finally`. | KILLED by clean run. |
| K6 | Clone/cluster leaks on normal, failing, or collection paths | Private-root census was `0` before/after clean, fault, and normal `vitest list` runs. | KILLED. |
| K7 | Test can reach TEST/PROD or a host PostgreSQL | Private `initdb` cluster has Unix socket only (`listen_addresses=''`), random port, a generated `pbt_cluster_*` root and names guarded by `disposablePostgresHarness`. | KILLED by inspection/runtime. |

## Independent runtime evidence

```bash
pnpm run check:saas-a0-greenfield-baseline
pnpm run test:webapp:postgres
```

Result: both `exit=0`. A0 census was `tables=241`, `functions=196`, `policies=244`; manifest
entries `integrator=68`, `drizzle=288`; pending `integrator=0`, `drizzle=18`; package tests `8/8`.
The project replayed via the real webapp runner to `count=306` and passed `3` files / `4` tests.
The current file tail at this candidate is
`apps/webapp/db/drizzle-migrations/0305_tariff_snapshot_access_doors_local.sql`; `0306` is not
present in `meta/_journal.json` or the migration directory, so no older tail is claimed as current.

```bash
pnpm --dir apps/webapp exec vitest list --config vitest.postgres.config.ts
```

Result: the two harness self-test files and one product file were listed, for `3` files and `4`
test cases. The normal collection path built the template and ended with
`collection_post_clusters=0`.

```bash
pnpm --dir apps/webapp exec tsx -e '<temporary lifecycle probe>'
```

Result (the probe uses the harness's private socket and `pg_database` owner listing):

```text
before_clone=pbt_tpl_…:bcb_a0_owner
after_clone=pbt_audit_owner_…:bcb_a0_owner,pbt_tpl_…:bcb_a0_owner
after_drop=pbt_tpl_…:bcb_a0_owner
scratch_removed=true
```

This is the `\l`/ownership check: clone and template use the same private owner, the named clone
is gone after `dropDisposableDatabase`, and teardown removes the owned scratch root.

## Atomicity fault injection

The source candidate was not changed. An exact temporary detached worktree at the candidate SHA
received one audit-only hook after the real A0 restore and pending-migration replay. With
`B1_AUDIT_ATOMICITY_FAULT=read-then-delete`, it replaced only the function in the disposable
template with an unsafe variant that reads the latest challenge without principal or challenge
locks, deletes it without checking the delete result, and returns success.

```bash
B1_AUDIT_ATOMICITY_FAULT=read-then-delete pnpm run test:webapp:postgres
```

Result: expected `exit=1`, `1 failed / 2 passed` files and `1 failed / 3 passed` tests. The
product oracle received the second result `{ ok: true, code: null, user_id: <fixture UUID> }`
where it requires `{ ok: false, code: 'expired_code', user_id: null }`. The private-root census
was `fault_pre_clusters=0` and `fault_post_clusters=0`. The detached worktree and hook were
removed immediately afterwards.

## Conversion, boundaries, and CI inspection

```bash
git diff --name-status 6735dd2ae^ 6735dd2ae
rg --files apps/webapp/src -g '*.devDb.integration.test.ts' | wc -l
rg --files apps/webapp/src -g '*.postgres.integration.test.ts' | wc -l
node scripts/check-no-new-raw-sql.mjs
node scripts/check-test-runner-visibility.mjs
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint --no-ignore src/infra/repos/pgEmailOtpPublicAtomicConsume.postgres.integration.test.ts
pnpm exec prettier --check .github/workflows/ci.yml
git diff --check
```

Result: `6735dd2ae` deletes only
`pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts` and adds its
`.postgres.integration.test.ts` replacement; legacy count is now `21` (from the authority's
`22`), postgres count `3`, product count `1`. There is no opt-in, DEV/scratch allowlist or new
`pg.Pool.query`/SQL-text bypass: the product test uses existing `getPool`, `startPoolTransaction`,
`getWebappSqlFromPgClient`, `runWebappSql` and Drizzle `sql` fragments. Raw-SQL gate passed
(`webapp manifest files: 21`), runner visibility passed (`webapp disk=151, runner=130,
invisible=21`), typecheck/lint/YAML parse and `git diff --check` passed.

`.github/workflows/ci.yml` contains a standalone `test-webapp-postgres` job named
`Test (webapp disposable PostgreSQL)`: it installs `postgresql-16` and executes
`pnpm run test:webapp:postgres`. `vitest.postgres.config.ts` remains outside the default/fast
Vitest config, so this project is not a fast shard.

## Active-record inspection

`TEST_SUITE_AUDIT_2026-07-29.md` correctly records that B2 no longer claims the old
non-buildable-harness blocker; it separates project visibility from CI execution. It leaves B3
open as `1 of 22`, does not transfer `wt/testsuite-b` v1, and does not call A0 an ACL/RLS proof:
V1/V9б remain the A1/TEST contract.
