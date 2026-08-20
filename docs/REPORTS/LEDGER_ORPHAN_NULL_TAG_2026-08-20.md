# DEV Drizzle ledger: removal of the tagless orphan (2026-08-20)

Scope: only the local DEV database `bcb_webapp_dev`; TEST and PROD were not opened. The row was
removed only by `deploy/postgres/privileges/migrate-local.mjs`, never by hand-written ledger DML.

## Origin and deletion decision

`git log --all --oneline -S'c13927102c549a4d'` identifies commit
`230a2494f` only because its commit message records the already-known inert orphan; the originating
report is `docs/REPORTS/MIGRATION_TIMESTAMP_FIX_2026-08-20.md:281-301`, introduced by
`2326167251d205b88a04ed7ea6dfdcf543a8ffb6`. It says the row at
`created_at=1800000070000` was incorrectly labelled by an old, uncommitted legacy-backfill journal,
matched no file in any branch, and was returned to `tag=NULL`; it also explicitly says the concurrent
mutation's cause was not proven by logs. `AUDIT_MIGRATION_LEDGER_2026-08-20.md:41-47,146-153` later
independently classified the same row as the sole foreign ledger row and documented the earlier raw
ledger edit as a violation.

The source command in the brief used `left(hash,16)`: `c13927102c549a4d` is a prefix, not a
16-character stored hash. The fresh exact query below found the full 64-character SHA-256 value
`c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124`. No file in the migration folder
claims it, so this is neither an applied migration nor a rename requiring `--relabel`; deleting it
through the protected foreign-row operation is the lawful repair.

## Evidence

| Assertion | Command | Conclusion |
| --- | --- | --- |
| There was one tagless DEV row before the repair. | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -tAc "BEGIN READ ONLY; select id, coalesce(tag,'<NULL>'), left(hash,16), created_at from drizzle.__drizzle_migrations where tag is null; ROLLBACK;"` | `598|<NULL>|c13927102c549a4d|1800000070000` |
| Its exact stored hash is 64 characters. | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -tAc "BEGIN READ ONLY; select id, coalesce(tag,'<NULL>'), hash, created_at from drizzle.__drizzle_migrations where tag is null or hash = 'c13927102c549a4d' order by id; ROLLBACK;"` | `598|<NULL>|c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124|1800000070000` |
| The wrapper accepts only a real tagless foreign row addressed by its complete hash, and pins the selected id/tag/hash in its DELETE. | `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs > /tmp/ledger-orphan-targeted-tests-final.log 2>&1; echo "EXIT=$?"` | `EXIT=0`; 55 tests passed. The new tests cover successful removal, file-hash refusal, absent-hash refusal, and missing `--drizzle-folder` refusal. |
| The file-claim guard is real. | Temporary mutation `if (claimant)` → `if (false && claimant)` in the new `--drop-foreign-hash` path, then `node --test deploy/postgres/privileges/migrate-local.test.mjs > /tmp/ledger-orphan-new-handler-fault.log 2>&1; echo "EXIT=$?"` | `EXIT=1`; test 22 (`drop-foreign-hash refuses a tagless row whose hash a file in this folder still claims`) failed. The mutation was restored before final tests. |
| The orphan was removed through the sanctioned wrapper, not psql. | `node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --drop-foreign-hash c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124 > /tmp/ledger-orphan-drop.log 2>&1; echo "EXIT=$?"` | `EXIT=0`; wrapper logged `BEGIN`, `DELETE 1`, `COMMIT`, `pending=0 total=58`, `foreign-ledger-rows=1` (the pre-delete snapshot), and `dropped-foreign-by-hash=1`. |
| No tagless foreign row remains and the supported DEV preflight is green. | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -tAc "BEGIN READ ONLY; select count(*) as foreign_ledger_rows from drizzle.__drizzle_migrations where tag is null; ROLLBACK;"; bash deploy/host/migrate-dev.sh --preflight > /tmp/ledger-orphan-preflight-after.log 2>&1; echo "EXIT=$?"` (run from `/home/dev/dev-projects/BersonCareBot`, the canonical DEV checkout) | Count `0`; `EXIT=0`; preflight printed `pending=0 total=58 verified-objects=90 foreign-ledger-rows=0` and `migrate-dev preflight: PASS`. |

The first preflight attempted from this isolated worktree stopped before database access with
`FATAL: DEV API env path guard failed`, as intended: that worktree has no canonical DEV `.env` files.
The final preflight was therefore run from the canonical checkout named by the wrapper's own path
guard; it used the same `bcb_webapp_dev` database and did not touch TEST or PROD.
