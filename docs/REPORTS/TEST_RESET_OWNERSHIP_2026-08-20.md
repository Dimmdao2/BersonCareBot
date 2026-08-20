# TEST full reset: ownership contract and live run, 2026-08-20

## Outcome

The database-ownership blocker is fixed and proven by a live restore. The full reset is **not complete**:
the run stopped at the owner-reviewed FIO fail-closed gate because the live PROD data changed after the
reviewed manifest was sealed. This is now an owner decision, not a database privilege or deployment defect.

No role was created, no runtime privilege was expanded, no `GRANT CREATE ON DATABASE` was issued, no
`BYPASSRLS` was issued, and no migration/ledger row was edited manually. PROD contact was limited to the
reset script's existing read-only `pg_dump` command.

## Ownership contradiction: resolution

The contract is:

1. The managed database owner is `postgres`. `deploy/host/deploy-test.sh` already enforces that contract
   and was intentionally left unchanged.
2. A fresh `--no-owner` restore is executed by the local administrative database owner, `postgres`.
3. The later declarative privilege checkpoint transfers ordinary schemas/relations to
   `app_object_owner` and exact protected seams to their declared owners. In particular,
   `deploy/postgres/generated/privileges.bersoncarebot_test.sql` declares the database owner as
   `postgres`; the ordinary-object declaration contains the `app_object_owner` handoff.
4. `deploy/postgres/runtime-overlay-app-owner-handoff.sql` confirms why restore-time ownership must remain
   the database owner until the ordered handoff: restored functions initially belong to the database
   owner, then the exact protected functions are transferred to `app_owner` before their overlays replace
   them.

This resolves the three places as follows:

- `deploy/host/deploy-test.sh`: unchanged; its live-deploy assertion remains `database owner = postgres`.
- `deploy/host/deploy-test-saas.sh`: the stale `DBROLE=bersoncarebot_test` owner assertion and all temporary
  membership/`BYPASSRLS` machinery were removed. Restore-stage SQL and FIO now run locally as OS/database
  administrator `postgres`; the pre-handoff assertion requires both database and `platform_users` to be
  owned by `postgres`. A pre-existing retired `bersoncarebot_test` role is only checked for forbidden
  elevation; it is never created or altered.
- `deploy/host/restore-test-db-from-dump.sh`: creates `bersoncarebot_test` with owner `postgres` and runs
  `pg_restore --role=postgres`. It no longer creates the old `bersoncarebot_test` role and does not attempt
  to restore as `app_object_owner`, which correctly has no `CREATE` privilege on the database.

The implementation is commit `4a352a6a8` (`fix(test-reset): restore under postgres ownership contract`).
The current branch also merges the then-current `feat/doctor-ui-rebuild` in `cb14039b7`, so the executable
checkout contained both the ownership fix and all current feat changes. The reset command used the worker
ref `wt/ownership-20260820` because the worker is forbidden to write directly to `feat`; input hashes and
the executable reset path were otherwise identical to the requested invocation.

## Validation of the ownership change

Command:

```bash
bash -n deploy/host/restore-test-db-from-dump.sh \
  deploy/host/deploy-test-saas.sh \
  deploy/host/deploy-test.sh \
  deploy/host/deploy-test-full-reset.sh
git diff --check 4a352a6a8^ 4a352a6a8
rg -n '^[[:space:]]*(CREATE ROLE|GRANT CREATE ON DATABASE|ALTER ROLE .*BYPASSRLS|GRANT .*app_object_owner|GRANT .*bersoncarebot_test)' \
  deploy/host/restore-test-db-from-dump.sh deploy/host/deploy-test-saas.sh
```

Output:

```text
bash -n: PASS
git diff --check 4a352a6a8^..4a352a6a8: PASS
forbidden ownership/elevation statements in changed reset paths: none
```

## Full reset run

Command executed in the foreground; complete captured transcript:
`/tmp/bcb-test-reset-ownership-20260820.log`.

```bash
set -o pipefail
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test.manifest.json \
  --fio-manifest-file-sha256=ff312656a44fd46e0acc561ca342233001f5eaa87603a5c7326f672c81321109 \
  --fio-manifest-sha256=7b995fb378b29f18423f8a3fdb311b90f791df7efe26301937fe7ded88608700 \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  wt/ownership-20260820 2>&1 | tee /tmp/bcb-test-reset-ownership-20260820.log
```

Step log, in execution order:

1. Same-checkout snapshot preflight: passed.
2. Destructive confirmation and runtime-mode preflights: passed.
3. Bundle/checkout and build: passed. The existing NFT trace warning remained non-fatal.
4. Hash-bound FIO verification: passed:

   ```json
   {"command":"verify","verified":true,"rows":170,"manifestSha256":"7b995fb378b29f18423f8a3fdb311b90f791df7efe26301937fe7ded88608700","reviewSourceSha256":"56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700"}
   ```

5. TEST delivery snapshot and writer stop: passed. The protected manifest was staged for the local
   PostgreSQL executor.
6. Fresh byte-for-byte PROD dump: fetched by the existing read-only `pg_dump` path; size reported as
   `60M`.
7. Restore under `postgres`: passed:

   ```text
   restore-test-db-from-dump: PASS (platform_users=299 integrator_schema_migrations=68 public_tables=187)
   ```

8. Owner identity consolidation: committed successfully.
9. `p0-data-fix-doctor-admin-split.sql`: committed successfully; its postcondition reported one canonical
   doctor and one separate live global administrator.
10. Owner-reviewed FIO apply: stopped fail-closed before migration:

    ```json
    {"ok":false,"error":"fio_owner_review_operation_failed"}
    ```

No baseline/migration/reconcile/privilege/service-start stage ran after this failure. Consequently, the
59-row target ledger, generated privilege check, reconcile, schema B and live service gates are not claimed.

## FIO blocker diagnosis

The same code and transport were run in read-only preview mode against the stopped TEST copy:

```bash
sudo -u postgres env \
  DATABASE_URL='postgresql:///bersoncarebot_test?host=/var/run/postgresql' \
  DB_PRINCIPAL_CONTEXT_MODE=legacy-guc NODE_ENV=test USE_REAL_DATABASE=1 \
  bash -c "cd /opt/projects/bersoncarebot-test && \
    pnpm --dir apps/webapp run fio:owner-reviewed-test:preview -- \
      --test --manifest /tmp/bcb-fio-debug-20260820/manifest.json"
```

Output:

```json
{"command":"preview","target":"TEST","manifestSha256":"7b995fb378b29f18423f8a3fdb311b90f791df7efe26301937fe7ded88608700","total":170,"eligibleUpdates":161,"alreadyMatched":3,"expectedMissing":1,"preservedCurrent":4,"unexpectedMissing":0,"unexpectedDrift":1}
```

The single drift is row `4ff57819-06ff-4938-b0d7-7470b6cf073c`. A null-safe field comparison showed that
all reviewed `expectedBefore` name fields still match, but `merged_into_id` no longer matches: the reviewed
manifest expects it to be null, while the fresh dump has it merged into
`36f11d6b-b035-4b1c-8d59-7fd3c1ecc4db`. The requested first-name correction has not been applied.

Command:

```sql
SELECT
  (pg_read_file('/tmp/bcb-fio-debug-20260820/manifest.json')::jsonb)->>'createdAt'
    AS manifest_created_at,
  source.updated_at AS source_updated_at,
  source.merged_into_id,
  target.created_at AS merge_target_created_at,
  target.updated_at AS merge_target_updated_at,
  target.merged_into_id AS merge_target_merged_into_id
FROM public.platform_users source
LEFT JOIN public.platform_users target ON target.id = source.merged_into_id
WHERE source.id = '4ff57819-06ff-4938-b0d7-7470b6cf073c';
```

Output:

```text
manifest_created_at     2026-07-18T22:11:54.528Z
source_updated_at       2026-08-16 13:28:10.522147+03
merged_into_id          36f11d6b-b035-4b1c-8d59-7fd3c1ecc4db
merge_target_created_at 2026-03-21 09:51:34.043753+03
merge_target_updated_at 2026-08-16 13:31:18.642226+03
merge_target_merged_into_id NULL
```

Therefore the merge happened after the 18 July owner review. `enforceFailClosedPlan` is behaving as
designed. Automatically treating this as `preserveCurrent`, updating a merged tombstone, or redirecting
the reviewed FIO correction to the canonical row would each change the owner-reviewed data decision and
cannot be inferred by the reset worker.

## Live TEST state after the stop

Database and cluster-role command:

```sql
SELECT datname, pg_get_userbyid(datdba) AS owner, datconnlimit
FROM pg_database WHERE datname='bersoncarebot_test';
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls
FROM pg_roles WHERE rolname IN ('bersoncarebot_test','app_object_owner') ORDER BY rolname;
SELECT has_database_privilege('app_object_owner','bersoncarebot_test','CREATE')
  AS app_object_owner_can_create;
```

Output:

```text
bersoncarebot_test | postgres | -1
app_object_owner   | f | f | f | f | f
app_object_owner_can_create = f
```

The absence of a second role row proves `bersoncarebot_test` was not created. `datconnlimit` was restored
to `-1` by the restore cleanup path.

Data-stage command:

```sql
SELECT
  (SELECT tableowner FROM pg_tables
   WHERE schemaname='public' AND tablename='platform_users') AS platform_users_owner,
  (SELECT count(*) FROM public.platform_users) AS platform_users,
  (SELECT count(*) FROM drizzle.__drizzle_migrations) AS current_dump_ledger_rows;
SELECT
  count(*) FILTER (WHERE role='doctor' AND merged_into_id IS NULL) AS live_doctors,
  count(*) FILTER (WHERE role='admin' AND merged_into_id IS NULL AND NOT is_archived) AS live_admins
FROM public.platform_users;
```

Output:

```text
platform_users_owner=postgres | platform_users=296 | current_dump_ledger_rows=136
live_doctors=1 | live_admins=1
```

This is intentionally the restored schema-A/data-fix state, not final schema B. The target 59-row ledger
has not been installed and must not be confused with the 136-row ledger present in the fresh source dump.

Service command:

```bash
for unit in api worker scheduler webapp media-worker; do
  printf '%s active=%s failed=%s\n' "$unit" \
    "$(systemctl is-active "bersoncarebot-$unit-test" || true)" \
    "$(systemctl is-failed "bersoncarebot-$unit-test" || true)"
done
```

Output:

```text
api active=inactive failed=inactive
worker active=inactive failed=inactive
scheduler active=inactive failed=inactive
webapp active=failed failed=failed
media-worker active=inactive failed=inactive
```

The services remain stopped because starting them on the deliberate pre-migration schema-A stop would be
unsafe and would falsely present this reset as complete.

## OWNER QUESTION / blocker

For the post-review merge of `4ff57819-06ff-4938-b0d7-7470b6cf073c` into
`36f11d6b-b035-4b1c-8d59-7fd3c1ecc4db`, which reviewed outcome is required?

1. Preserve/skip the merged source row and seal a new manifest/hash.
2. Apply the intended FIO correction to the canonical target row and seal a new reviewed manifest/hash.
3. Apply the intended FIO correction to the merged source row while retaining its merge link, with that
   state explicitly represented in a new reviewed manifest/hash.

Until this is decided and a matching owner-reviewed manifest is supplied, the full reset cannot safely
pass the FIO gate or continue to migration/reconcile/service start.
