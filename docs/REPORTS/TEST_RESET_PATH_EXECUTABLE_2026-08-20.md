# TEST full-reset path — execution report (2026-08-20)

**Branch:** `wt/restore-ab-20260820`  
**Deploy artifact tested:** `7bd99dcce` (`feat/doctor-ui-rebuild` was fast-forwarded locally only for the
standard TEST checkout to consume the committed artifact)  
**Outcome:** **BLOCKED at the restore-wrapper ownership contract.** The full reset is not claimed executable.

## Authority and boundary

The removal follows the owner decision recorded in `docs/OWNER_DECISIONS.md` and commit `0123b1133`:
external-system appointments do not exist, therefore the table/bridge/check must be removed rather than
restored. The run used the standard full-reset entrypoint; its only PROD contact was its built-in,
read-only `pg_dump` through `bcb-clone`. No anonymization was added or run. No migration was changed;
no runtime role, `GRANT`, `REVOKE`, role creation, or `BYPASSRLS` entitlement was added.

## Changes made

1. Removed the retired legacy appointment cutover from `deploy/host/deploy-test-saas.sh`:
   `--rubitime-csv`, `--rubitime-csv-sha256`, protected-input validation/staging,
   `POSTGRES_RUBITIME_CSV`, usage text, missing-file preflight, and the executable
   `cutover:legacy-appointments` invocation.
   
   Exact proof that no active full-reset consumer remains:

   ```bash
   rg -n -C 3 'cutover-legacy-appointments|rubitime-csv|POSTGRES_RUBITIME_CSV|RUBITIME_CSV|LEGACY_APPOINTMENT_CUTOVER' \
     deploy/host/deploy-test-saas.sh deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test.sh
   # exit 1, no matches
   ```

   The CSV had no other active consumer on this path; it was not retained.

2. Replaced the historical `>= 178` gate with a lower bound derived at runtime from the deployed
   `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql`. The check counts that artifact's
   `INSERT INTO drizzle.__drizzle_migrations` rows and refuses a database with fewer rows. Thus a later
   target ledger changes the required floor without a hand-edited constant, while a ledger that did not
   arrive still fails.

   ```bash
   awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' \
     deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
   # 59
   ```

3. Removed only the full-reset preflight dependency on
   `deploy/host/smoke-set-postgres-role-password.sh`. That disposable-database smoke was deleted by
   `fb44002ce` under the B0 decision and is never called by the full-reset route. Its separate explicit
   C4 self-test remains outside this route and was not changed.

4. Made a retry from the named TEST database possible after an interrupted reset. If schema A has already
   been restored and `public.system_settings` is absent, there is no previous TEST SMTP value to preserve;
   the existing reset overlay retains `{"value":null}`. When schema B exists, the original exact-one,
   validated SMTP snapshot/restore contract remains in force.

## Blockers found, evidence, disposition

| # | Reachable situation | Evidence command and result | Disposition |
| --- | --- | --- | --- |
| B1 | Removed `cutover-legacy-appointments.ts` was still mandatory before the reset could start. | `git show -1 --format=full 0123b1133` names its absent sources `integrator.rubitime_records` and `public.appointment_records`; the initial live run reported `FATAL: missing repo file: apps/webapp/scripts/cutover-legacy-appointments.ts`. | Fixed by item 1; never restored. |
| B2 | Hand-written 178 described the deleted historical chain rather than current schema B. | `awk … ledgers-and-baseline.sql` above returned `59`; `rg -n -C 4 'CNT=|178' deploy/host/deploy-test-saas.sh` located the old gate. | Fixed by item 2. |
| B3 | Full-reset preflight required a deleted disposable PostgreSQL smoke. | `git log --all --diff-filter=D --format='%H %s' -- deploy/host/smoke-set-postgres-role-password.sh` returned `fb44002ce fix(db): retire disposable database execution surfaces`; live run reported the missing executable. | Fixed by item 3; the standalone self-test is outside steps 3–5. |
| B4 | A failed reset left TEST at schema A, so a retry tried to read a non-existent `public.system_settings` before restoring the next dump. | `/tmp/bcb-test-full-reset.StCqVC.log`: `ERROR: relation "public.system_settings" does not exist`; `rg -n -C 8 'snapshot_test_smtp_outbound|restore_test_smtp_outbound' deploy/host/deploy-test-saas.sh` showed the unconditional query. | Fixed by item 4; the next run printed `TEST SMTP: schema A retry has no prior TEST setting`. |
| B5 | Restore cannot create target schemas under its declared object-owner role. | Final live log `/tmp/bcb-test-full-reset.ys8B5n.log`: `pg_restore: error: … permission denied for database bersoncarebot_test` / `CREATE SCHEMA drizzle;`. `sed -n '1,260p' deploy/host/restore-test-db-from-dump.sh` shows `createdb --owner=postgres` followed by `pg_restore --role=app_object_owner`; `sudo -u postgres psql …` reported `bersoncarebot_test|owner=postgres|acl=`. | **OPEN BLOCKER.** The brief forbids adding the missing privilege or expanding roles. The wrapper's later caller also demands database owner `bersoncarebot_test`, so choosing the ownership transition needs an owner-approved contract; it was not guessed. |

## Known items checked but not changed

- `run_strict_post_migration_closure()` remains reachable only via the explicit orphan
  `--post-migration-closure` mode. This is not on the full-reset route, which ends in
  `run_port_context_test_release()`.
- The port-context capability catalog is not a full-reset blocker. The final route calls
  `deploy/host/cutover-postgres-port-context.sh`; its `port_context_cutover_install_target()` calls the
  declaration generator and `reconcile-access.mjs`, which seeds the TEST catalog and then performs mTLS
  readiness probes. Evidence:

  ```bash
  rg -n -C 5 'run_strict_post_migration_closure|run_port_context_test_release|install_port_context_capability_catalog' \
    deploy/host/deploy-test-saas.sh
  rg -n -C 5 'port_context_cutover_install_target|reconcile-access' \
    deploy/host/cutover-postgres-port-context.sh
  ```

## Validation

```bash
bash -n deploy/host/deploy-test-saas.sh deploy/host/deploy-test-full-reset.sh
# PASS

node --test deploy/host/deploy-test-full-reset.test.mjs \
  deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
# PASS: 6/6

bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test.manifest.json \
  --fio-manifest-file-sha256=ff312656a44fd46e0acc561ca342233001f5eaa87603a5c7326f672c81321109 \
  --fio-manifest-sha256=7b995fb378b29f18423f8a3fdb311b90f791df7efe26301937fe7ded88608700 \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  feat/doctor-ui-rebuild 2>&1 | tee /tmp/bcb-test-full-reset.ys8B5n.log
# BLOCKED at B5 after fresh production dump and before schema migration.
```

The final attempted run used checkout `7bd99dcce50`, passed the current-DEV snapshot check, FIO-manifest
verification (170 rows), the schema-A SMTP retry path, and the fresh dump pull (60M) before B5. Its EXIT
guard left TEST fail-closed (`CONNECTION LIMIT 0`); TEST units are stopped. No successful end-state,
runtime health, ledger count, or capability-catalog count is claimed.

## Commits

- `4862645dc` — remove retired legacy appointment reset step and derive ledger floor.
- `8983a8cb8` — remove retired disposable-smoke preflight.
- `7bd99dcce` — make schema-A retry preserve the safe reset SMTP state.

