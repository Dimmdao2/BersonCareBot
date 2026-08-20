# AUDIT — `70b08ffeb`: schema derivation and service-queue tier

Scope: `70b08ffeb^..70b08ffeb`; auditor pass on 2026-08-20.

## Method

- 1, 2, 5: executable behaviour evidence. Fault: a qualified `CREATE TABLE integrator.x` from a webapp migration is derived as `public.x`; consequence: P0.10 tier/RLS coverage can silently target the wrong relation.
- 3, 4, 6: one-time inspection of generated artifact, live DEV catalog, and commit boundary.

## Results

1. PASS — `readActualBaseTables()` at `70b08ffeb` contains exactly one retry queue relation: `integrator.direct_public_write_retries`; it contains no `public.direct_public_write_retries`. The target's 215 `public`/`integrator` derived relations exactly match the 215 rows from the read-only DEV catalog query (`derivedNotInDev=[]`, `devNotDerived=[]`).
2. PASS — set comparison uses the parent and target worktrees. Parent=217, target=216; removed=`public.direct_public_write_retries`, added=`[]`. `integrator.direct_public_write_retries` was already in the parent set, so the exact set delta is one removal, not a second reclassification; no other table changed schema classification.
3. PASS — running `p0-5b-grants-sql.mjs` in each worktree produces byte-identical 26,507-byte artifacts. Added and removed literal GRANT/REVOKE statements are both empty; app_staff table count remains 180. The declaration for the queue has only `app_integrator_request` INSERT and `app_operational_delivery_worker` SELECT/UPDATE entries; it has an explicit app_staff revoke rationale.
4. PASS — DEV catalog reports `organization_id:uuid:true`, no foreign-key constraint, and the validated payload/operation checks. `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-user-reference-tier-guard.mjs` exits 0 with `INFRA/TELEMETRY=0`; the queue is reached only through the integrator write port and delivery worker, not a tenant route.
5. PASS — in a disposable target worktree, replacing only `actual-schema-tables.mjs` with its parent version makes the target checker's `--self-test` fail with `old_behavior_exit=1` (`qualified webapp CREATE TABLE schema mismatch`). Restoring `70b08ffeb` makes it pass with `restored_behavior_exit=0`.
6. PASS — `git diff --stat 70b08ffeb^ 70b08ffeb` reports exactly four files (109 insertions, 111 deletions); `git diff --name-only ... -- apps/webapp/db/drizzle-migrations apps/integrator/src/infra/db/migrations deploy/postgres/privileges` is empty. `git diff --check` exits 0.

## Full CI

The ordinary lock-wrapped CI preflight exited 1 because the orchestration tree still had one writer and one unmerged branch. Owner authority required full CI, so the documented override was run:

```bash
/home/dev/brain/host-orch/run-tests.sh "BCB_CI_ALLOW_CONCURRENT_WRITERS=1 pnpm run ci"
```

`runs/ci-last.json` records SHA `c9fbe9bb422e53997a6d3d2424a6eb13028b7624`, `stepsExit=0`, `exitCode=0`, and `movedDuringRun=false`.

## Commands

```bash
node /tmp/bcb-audit-70b08ffeb-target/docs/_TODO/SAAS_FOUNDATION/scripts/actual-schema-tables.mjs --print
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -c "select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','integrator') order by 1;"
node /tmp/bcb-audit-70b08ffeb-target/docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs --self-test
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-user-reference-tier-guard.mjs
git diff --stat 70b08ffeb^ 70b08ffeb
```
