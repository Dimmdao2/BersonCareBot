# Runtime migration rollback correction: final independent re-audit (2026-08-17)

## Scope

- Candidate: `3978a940d09cff41f5afc0300a35681961d896da`.
- Parent: `d82dff461cab4c37a5329b2d4a2dbcb4d2315576`.
- Failed audit authority: commit `30065689099dc7968c55c333da307967b09e4290`, report
  `RUNTIME_MIGRATION_SYNTAX_PREFLIGHT_FINAL_AUDIT_2026-08-17.md`.
- Fresh full clone: `/home/dev/dev-projects/bcb-wt-runtime-migration-rollback-final-reaudit-20260817`, branch
  `wt/runtime-migration-rollback-final-reaudit-20260817`.
- No live database, DEV, TEST, PROD, deploy, migration or reconcile command.

## Verdict

**PASS.** Candidate `3978a94` closes the only previous finding. Rollback-only mode now rejects every legacy
executable surface (`--step`, `--owner`, `--migration`, `--backfill`, `--post`) before resolving the Drizzle folder,
reading the ledger or spawning psql. Exact presence checks are independent of argument order and reject repeated or
combined flags. The ordinary non-rollback legacy migration/backfill/post path still renders all three files and
ends in `COMMIT`.

No new reachable violation was found. The previously accepted product syntax correction and named-DEV
preflight/execute behavior remain unchanged.

## Previous finding closure

The guard is immediately after CLI mode detection and before `spawnPsql`, `readDrizzleMigrations`,
`readAppliedDrizzleRows`, `realpathSync` of the Drizzle folder, or any legacy file read. It builds a closed allow-deny
set from the five exact legacy options and throws when any are present with `--rollback-only`.

Independent fake-psql probes covered:

- backfill before rollback-only, with the backfill flag repeated;
- post before rollback-only, with the post flag repeated;
- all five legacy options combined and reordered around rollback-only/Drizzle arguments;
- repeated rollback-only and repeated owner arguments;
- a valid ordinary legacy migration plus backfill plus post.

The rejected cases deliberately referenced a nonexistent Drizzle directory. They still returned before path
resolution and created no psql call log. Result:

```json
{"rollback_cases_rejected_before_psql":4,"reordered":true,"repeated":true,"combined_all_legacy_flags":true,"normal_legacy_execute":{"migration":true,"backfill":true,"post":true,"commit":true,"rollback":false},"live_database_used":false}
```

The maintained fake-runtime suite independently covers each of the five flags and confirms no psql invocation or
transaction output.

## Preserved product and wrapper behavior

The PostgreSQL 18 parser from `libpg-query 18.1.4` was rerun in-process. All four function statements parse; removing
the statement-5 CASE grouping reproduces the prior exact failure:

```json
{"functions":[{"statement":1,"name":"app.read_patient_reminder_materialization_snapshot","language":"plpgsql","parsed":true},{"statement":2,"name":"app.read_patient_reminder_delivery_target_snapshot","language":"plpgsql","parsed":true},{"statement":3,"name":"app.patient_reminder_materialization_fingerprint","language":"sql","parsed":true},{"statement":5,"name":"app.commit_patient_reminder_materialization","language":"plpgsql","parsed":true}],"ungrouped_mutation":"RED","error":"syntax error at end of input"}
```

The correction commit changes only `migrate-local.mjs` and its fake-runtime tests; migration SQL is byte-identical to
the accepted parent.

Inspection and maintained tests reconfirm:

- preflight targets exact local `bcb_webapp_dev`, canonical paths and stationary `bcb_dev_migrator`;
- pending webapp DDL, prospective ledger row and temporary grants remain one `BEGIN ... ROLLBACK` stream with no
  `COMMIT`;
- preflight success and failure do not run integrator migration, shared-role baseline, reconcile or env update;
- failure status propagates through `setsid --wait`; lock and signal process-group handling are unchanged;
- execute does not pass rollback-only, still commits webapp DDL, then runs the second integrator phase, reconcile,
  capability-env update and stationary-state verification.

## Gates

```bash
bash -n deploy/host/migrate-dev.sh
node --test \
  deploy/postgres/privileges/migrate-local.test.mjs \
  deploy/host/migrate-dev.test.mjs
```

Exit `0`: wrapper/host **14 passed, 0 failed**.

```bash
node --test \
  deploy/postgres/privileges/migrate-local-parse.test.mjs \
  deploy/postgres/privileges/reminder-materialization-boundary.test.mjs
node --experimental-strip-types --test \
  deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
```

Exit `0`: parser/boundary **11/11**, declaration **2/2**.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node scripts/check-b0-migration-baseline.mjs
node scripts/check-no-new-raw-sql.mjs
pnpm run typecheck
git diff --check d82dff461cab4c37a5329b2d4a2dbcb4d2315576 \
  3978a940d09cff41f5afc0300a35681961d896da
```

All exit `0`: four generated artifacts byte-identical; `B0 + 19 webapp / 0 integrator`, no legacy chain; production
raw-SQL debt `0`; all workspace typechecks green; candidate diff clean.

## Safety

All CLI probes used fake executables and temporary directories. The parser was in-process WASM. No database socket,
environment mutation, service, worker, scheduler or external channel was used. The audit branch contains only this
report.
