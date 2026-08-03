# D30 online-index deploy boundary — independent audit (2026-08-03)

## Verdict: FIXED; root acceptance/land pending

The bounded fixer replaced the ineffective `\quit 1` with a real SQL error under `ON_ERROR_STOP`, so PostgreSQL
16 now returns non-zero for every final-definition mismatch. The structural gate requires that fail-closed
statement. `check-d30-outgoing-delivery-claim-concurrency.ts` now exercises the artifact against a fresh
unix-socket-only PostgreSQL lifecycle: the old implementation failed the new piece 4d because the exact
same-name wrong-order index returned exit `0`; after the fix the wrong-order fixture returns non-zero with the
operator diagnostic, while missing-index creation and idempotent retry both return `0` and leave the exact
valid/ready ordered keys.

Fix verification repeated the runner/journal/layout gates, shell syntax for all four wrappers, D30 targeted
tests (`3` webapp; `51` integrator with `3` skipped), both typechecks, scoped ESLint, raw-SQL/queue gates and all
three disposable D30 concurrency scripts. A temporary removal of the real SQL error was rejected with
`d30_online_index_artifact_invalid missing=fail_closed_psql_error`. No DEV/TEST/PROD database, service or port
was touched; D30 Ш3 remains open.

## Original finding

`deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql` does not fail its caller when a same-name index is valid but incompatible. On disposable PostgreSQL 16, this command completed with **exit 0** while the index remained ordered `(status, organization_id, next_retry_at)`:

```bash
psql -X -v ON_ERROR_STOP=1 -f deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql
```

The artifact prints its `FATAL:` line and executes `\quit 1`, but `psql` 16.14 returned `0`. Each wrapper therefore continues to overlays/restart after a wrong index definition. This violates `TRACK_D_D30_ONLINE_INDEX_FIX_BRIEF.md` required final fail-closed gate and the D30 audit brief's exact valid same-name incompatibility kill case.

No product code was changed. DEV/TEST/PROD, services, ports and real env were not used.

## Independent evidence

- Installed `apps/webapp/node_modules/drizzle-orm` is `0.45.2`. Its `node-postgres/migrator.cjs:25-27` delegates to `db.dialect.migrate`; `pg-core/dialect` wraps pending migrations in `await session.transaction(...)`. A disposable PostgreSQL command `BEGIN; CREATE INDEX CONCURRENTLY ...; COMMIT;` exited `1` with SQLSTATE `25001`. Thus the former `0328` statement was a reachable deploy failure, not a theoretical restriction.
- Exact artifact lifecycle on fresh unix-socket-only PostgreSQL 16: first run produced valid/ready, non-unique, non-partial, expression-free btree keys `(organization_id, status, next_retry_at)`; second run exited `0`. A concurrent build on 5,000,000 compatible rows was terminated after `pg_index` reported `false|false`; the artifact dropped the residue and restored `true|true` exact keys (`artifact_recovery_exit=0`).
- The incompatible valid same-name fixture above preserved its wrong key order and returned exit `0`: this is the finding.
- View of all four wrappers confirms the artifact is invoked as standalone `psql` after the matching Drizzle command and before restart/closure: `migrate-dev.sh`, `deploy-test.sh`, `deploy-test-saas.sh`, `deploy-prod.sh`. Existing target/env/role conventions are retained; missing `-f` inputs are non-zero `psql` failures (and `migrate-dev`, SaaS TEST and PROD also preflight the tracked file).

## Fault injection (all restored byte-identically)

`node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --check-online-index-layout` exited `1` for each temporary fault:

| Fault | Diagnostic |
| --- | --- |
| `CREATE INDEX CONCURRENTLY` reinserted into `0328` | `transaction_forbidden_concurrent_index migration=0328_d30_specialist_task_delivery_queue_local` |
| absent artifact reference in each wrapper | `d30_online_index_wrapper_reference_missing wrapper=<migrate-dev\|deploy-test\|deploy-test-saas\|deploy-prod>` |
| artifact moved before `deploy-prod` migrate | `d30_online_index_wrapper_reference_missing wrapper=deploy-prod` |
| wrong index name, table, key order | `d30_online_index_artifact_invalid missing=concurrent_exact_index_create` |
| removed valid/ready/non-partial assertions | `d30_online_index_artifact_invalid missing=valid_assertion,ready_assertion,non_partial_assertion` |

SHA-256 before/after for the six temporarily changed product files was identical; the final tree before this audit artifact was clean.

## Repeated scoped checks

- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` — PASS.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS.
- `bash -n deploy/host/migrate-dev.sh && bash -n deploy/host/deploy-test.sh && bash -n deploy/host/deploy-test-saas.sh && bash -n deploy/host/deploy-prod.sh` — PASS.
- `pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/` — 1 file, 3 passed.
- `cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/ src/infra/runtime/worker/ src/infra/db/repos/outgoingDeliveryQueue` — 7 files / 51 passed, 1 file / 3 skipped.
- `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/integrator exec tsc --noEmit`; scoped ESLint — PASS.
- `node scripts/check-no-new-raw-sql.mjs`; `node scripts/check-queue-port-boundary.mjs`; both D30 disposable concurrency checks; `git diff --check` — PASS.

Full CI was intentionally not run, per audit brief.
