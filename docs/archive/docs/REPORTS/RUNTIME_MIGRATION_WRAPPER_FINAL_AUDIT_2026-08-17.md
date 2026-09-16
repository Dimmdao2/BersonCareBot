# Runtime migration wrapper correction round 2: final independent audit (2026-08-17)

## Scope

- Candidate: `d276a0eff9e313306c815bd5513665b138cfc930`.
- Parent: `8da88d798d932efb1dc5296b63cbabe2bacdc383`.
- Fresh full clone: `/home/dev/dev-projects/bcb-wt-runtime-migration-wrapper-final-audit-20260817`, branch
  `wt/runtime-migration-wrapper-final-audit-20260817`.
- Authority: `AGENTS.md` migration/security/test/orchestration rules, the previous audit report, the bounded final
  audit brief, and the canonical DEV failure fact below.
- Audit only: no product fix and no live database, DEV, TEST, PROD, deploy, migration or reconcile command.

## Canonical failure being corrected

The canonical root transcript recorded `bash deploy/host/migrate-dev.sh --execute`: statements 1 and 2 completed,
then statement 3 (`LANGUAGE sql`) failed with `ERROR: permission denied for language sql`; no `COMMIT` occurred and
the transaction rolled back. No persisted log artifact was found: the exact search

```bash
rg -l --hidden --no-messages "permission denied for language sql" \
  /tmp /home/dev/dev-projects/BersonCareBot \
  /home/dev/dev-projects/bcb-wt-runtime-migration-wrapper-*
```

returned no files. This audit did not reproduce the failure against any database because live execution was
explicitly forbidden.

## Verdict

**PASS.** Candidate `d276a0e` closes the observed executable gap without changing executable migration SQL.
Migration `0019` contains exactly six owner-ordered statements. Statements 1, 2, 3 and 5 are function DDL with the
exact schema/language metadata `app/plpgsql`, `app/plpgsql`, `app/sql`, `app/plpgsql`; statements 4 and 6 contain
only revokes and carry no false schema/language metadata. All six statements retain the exact isolated owner
`app_seam_reminder_materialization_owner`.

The wrapper consumes those markers into one owner-membership grant, one deduplicated `CREATE ON SCHEMA app` grant,
and one deduplicated `USAGE` grant for each of `plpgsql` and `sql`. It emits all grants before changing session
authorization, executes every statement under `SET LOCAL ROLE` for the isolated owner, restores postgres session
authorization before revocation, revokes every temporary grant and membership, verifies stationary migrator state,
and only then commits. The entire stream is one `psql` input with `ON_ERROR_STOP` and `BEGIN`/`COMMIT`; therefore a
statement error closes the uncommitted connection and PostgreSQL rolls back the temporary grants and DDL together.

## SQL and statement census

Candidate and both `8da88d7` and the pre-wrapper-correction `05f65bb88` are byte-identical after stripping only the
recognized migration metadata/temporary-number comment lines:

```json
{"executable_sql_identical_to_parent_8da88d7":true,"executable_sql_identical_to_pre_wrapper_05f65bb88":true}
```

Independent parsing and wrapper capture produced:

```json
{"statement_count":6,"function_statements":[1,2,3,5],"languages":["plpgsql","plpgsql","sql","plpgsql"],"metadata_faults_killed":20,"wrapper_owner_membership_grants":1,"wrapper_schema_grants":1,"wrapper_language_grants":["plpgsql","sql"],"wrapper_role_scopes":6,"wrapper_revokes_before_commit":true,"live_database_used":false}
```

The wrapper capture used a temporary fake `psql`: the ledger probe returned an empty ledger and the execution call
captured stdin. It never opened a socket or contacted PostgreSQL. This checks actual wrapper rendering and ordering,
not merely the presence of source comments.

## Mutation evidence

The real canonical parser test was run after each temporary migration mutation and the original file was restored
in a `finally` block. All **20/20** faults made the test red with `DDL metadata must match its executable SQL`:

- each of four function statements: missing schema, wrong schema, missing language and wrong language (`16`);
- each of the two non-function statements: injected fake schema and injected fake language metadata (`4`).

The tests derive expected schema and language from the executable `CREATE FUNCTION ...` and `LANGUAGE ...` clauses,
then compare them to parser output. They therefore reject metadata that disagrees with executable DDL; they are not
string-presence assertions. A clean rerun after restoration passed.

## Gates

```bash
pnpm install --offline --frozen-lockfile
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
```

Exit `0`: parser suite **6 passed, 0 failed**.

```bash
node --test deploy/postgres/privileges/reminder-materialization-boundary.test.mjs
node --experimental-strip-types --test \
  deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
```

Exit `0`: boundary **5/5**, declaration **2/2**.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node scripts/check-b0-migration-baseline.mjs
node scripts/check-no-new-raw-sql.mjs
git diff --check 8da88d798d932efb1dc5296b63cbabe2bacdc383 \
  d276a0eff9e313306c815bd5513665b138cfc930
```

All exit `0`: four generated privilege/allowlist artifacts are byte-identical; baseline is `B0 + 19 webapp / 0
integrator` with no legacy chain; production raw-SQL debt is `0`; diff check is clean.

## Safety

No live wrapper was run. No database, environment file, service, worker, scheduler, external channel or deployed
state was read or changed. All fault injections were restored, and the audit branch contains only this report.
