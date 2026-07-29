# Rubitime retirement DB cleanup sequence

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.
Task: taskdb `#757`.

## Scope

This is the repo-first, TEST/disposable-DB cleanup sequence for Rubitime retirement. It prepares the one-pass fresh-copy/TEST cleanup package that SaaS Foundation can use before the next non-Rubitime plan starts.

**2026-07-22 Track C cadence supersession:** this remains a future owner-gated destructive/fresh-copy reference,
not the routine TEST milestone. Routine verification keeps the existing TEST DB and uses only
`deploy/host/deploy-test.sh` with required forward migrations. Do not use this sequence to pull a fresh PROD dump,
reset TEST, repeat cutover/backfill, execute R6 drain, archive, or perform R7 drops without separate runtime and
owner evidence.

This document does not approve or describe live-environment work, does not create final proof placeholders, and does not generate a destructive migration. R5/R6/R7 final proof files remain future execution artifacts.

Canonical sources for this sequence:

- `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-db-cleanup-one-pass.mjs`

## One-Pass Entrypoints

The cutover/rehearsal flow is a single ordered sequence with repo entrypoints, not a manual DB cleanup checklist.
There must be no ad hoc `UPDATE`, no ad hoc `DELETE`, and no direct `DROP TABLE` between steps.

### Disposable fresh-copy rehearsal

Use this for a temporary database that has already been restored from the approved fresh dump and is ready for the
approved SaaS migration chain. The database name must be an obvious disposable/rehearsal name; the wrapper refuses
live-like and permanent dev names.

```bash
DATABASE_URL='<fresh-copy-runtime-owner-url>' \
SUPERUSER_URL='<same-db-superuser-url>' \
pnpm run rubitime:db-cleanup:one-pass -- \
  --dump=<approved-fresh-dump> \
  --csv=<fresh-rubitime-csv> \
  --run-saas-migrations \
  --execute \
  --commit-cleanup
```

What this executes in order:

1. dump TOC check;
2. `scripts/deploy-saas-667.sh` for the approved SaaS migration chain;
3. R1 clean-dump preflight;
4. placeholder booking cleanup dry-run and commit;
5. specialist consolidation dry-run and commit;
6. test/cancelled-duplicate cleanup dry-run and commit;
7. pre-import non-confirmed cleanup dry-run and commit;
8. owner CSV historical import/projection dry-run and commit;
9. mandatory post-import non-confirmed cleanup dry-run and commit;
10. stale-vs-owner-CSV cleanup dry-run and commit;
11. R1 classifier and dual-source audit;
12. current Rubitime retirement gate;
13. R7 table disposition gate;
14. post-R6 inventory expectation.

### TEST from-zero rehearsal

Use this only in an owner-approved destructive TEST flow. The full-reset wrapper requires explicit confirmation and
hash-bound protected inputs, then owns restore, migrations, Rubitime/history normalization, reviewed FIO apply,
strict closure, fixtures, restart, and smoke as one fail-closed chain. No service start or manual DB cleanup occurs
between those stages. Ordinary code deploys use `deploy/host/deploy-test.sh` and never restore the database.

```bash
bash deploy/host/deploy-test-full-reset.sh \
  --confirm-full-reset \
  --rubitime-csv=/secure/owner-rubitime.csv \
  --rubitime-csv-sha256=<approved-sha256> \
  --fio-manifest=/secure/fio-owner-manifest.json \
  --fio-manifest-file-sha256=<approved-file-sha256> \
  --fio-manifest-sha256=<approved-sha256> \
  --fio-review-source-sha256=<approved-review-sha256> \
  feat/doctor-ui-rebuild
```

Both protected files are installed outside the repository as regular `deploy`-owned mode `0600` files. The wrapper
prints only aggregate checks and hashes neither file content into logs beyond pass/fail confirmation.

### Plan-only check

Before running writes, the same wrapper can print the exact sequence without touching any DB:

```bash
pnpm run rubitime:db-cleanup:one-pass -- --csv=<fresh-rubitime-csv>
```

## Current Baseline

- `pnpm run check:rubitime-retirement-current` is expected to pass for the prepared current state.
- R6 hard static categories are currently zero:
  - `mountedRubitimeRouteLiterals=0`
  - `integratorRubitimeRuntimeImports=0`
  - `rubitimeApiClientRuntimeTokens=0`
- Remaining `rubitimeRawTableRuntimeRefs` are intentionally visible: `20 hits / 5 files`.
- The remaining raw-table refs are schema/export, provider-neutral retry storage on the legacy physical table, and
  strict purge cleanup. They are not hidden by this sequence.
- `check:rubitime-retirement-complete` must remain red until the real R5/R6/R7 proof files exist with owner decisions
  and command output.

## Non-Goals

- No live DB/env/SSH/service/webhook access.
- No live-environment `pg_dump`, `pg_restore`, `psql`, `pnpm migrate`, or host service commands in this repo-prep task.
- The future TEST/disposable rehearsal may run the documented repo wrappers above; this current package only prepares
  and validates that sequence.
- No direct `DROP TABLE`.
- No generated destructive migration in this task.
- No placeholder final proof files such as `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`.
- No resurrection/import of rows that exist only in `integrator.rubitime_records` and are absent from the fresh
  owner-approved Rubitime CSV.

## Data Canon

Fresh Rubitime CSV decides the appointment preservation set. The approved export is the one-specialist owner context
(`89643805480` / tail `9643805480`) matched through existing city/branch mappings.

`integrator.rubitime_records` and `integrator.rubitime_events` are audit/rollback material when the CSV exists. They
must not expand the preservation set, create a new backfill backlog, or block R1/R2/R6/R7 for integrator-only rows
absent from the fresh CSV.

## Sequence Overview

### Step 0. Freeze The Repo Contract

Goal: make the cleanup sequence explicit without touching environments.

Required repo artifacts:

- this sequence document;
- R7 table disposition;
- R7 archive/drop runbook;
- R7 static reference audit;
- final gate manifest and owner gate packet;
- static checker for this sequence.

Validation:

```bash
pnpm run check:rubitime-db-cleanup-sequence
pnpm run check:rubitime-retirement-current
```

### Step 1. Keep R1-R4/R5 Non-Prod Proof As Input

Use the already saved R1-R4 proof package and R5 code/non-prod proof as input. Do not add live-environment work to
this sequence.

Required input state before any future archive/drop execution:

- R1 CSV/canonical proof closed.
- R1 state-history proof closed.
- R2 doctor/client no-legacy-read proof closed.
- R3 slots/create, exact tenant and catalog proofs closed.
- R4 provider-neutral lifecycle, GCal, reminder and idempotency proof closed.
- R5 live disable remains outside this prep package.
- R6 cutoff/drain remains future owner-approved proof.

### Step 2. Archive Policy

Archive/export is required before any destructive migration for raw/history tables.

Archive candidates:

- `public.appointment_records`
- `integrator.rubitime_records`
- `integrator.rubitime_events`
- `public.rubitime_records`, if present
- `public.rubitime_events`, if present

Archive rules:

- Archive output is traceability/rollback-only.
- Archive output must not become a new import source.
- Archive output must not contain patient samples in repo docs.
- Archive proof must record directory, table list, missing-table `to_regclass(...)` evidence when applicable, and
  checksums.
- Retention horizon and rollback horizon require owner approval in the real R7 proof.

### Step 3. Table Disposition

Keep/defer tables:

| Table                                | Decision               | Cleanup action now                                                                               |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `public.patient_bookings`            | keep                   | No Rubitime cleanup action. Canonical patient booking history/runtime table.                     |
| `public.be_external_entity_mappings` | keep                   | Keep table. Rubitime rows are later traceability policy scope, not a table drop.                 |
| `integrator.booking_calendar_map`    | keep_until_replacement | Keep while GCal sync is active unless a tested canonical replacement exists.                     |
| `public.booking_*`                   | defer_drop             | Do not drop in Rubitime raw-table cleanup. Catalog compatibility is separate SaaS/catalog scope. |

Archive-before-drop tables:

| Table                                                | Decision            | Cleanup action now                                                                      |
| ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `public.appointment_records`                         | archive_before_drop | Prepare archive/export policy. Drop only after no runtime references and restore proof. |
| `integrator.rubitime_records`                        | archive_before_drop | Prepare archive/export policy. CSV remains canon; raw rows are audit-only.              |
| `integrator.rubitime_events`                         | archive_before_drop | Prepare archive/export policy. Raw payloads are audit-only.                             |
| `public.rubitime_records` / `public.rubitime_events` | archive_if_present  | Include only if metadata audit proves they exist/populated.                             |

Drop/defer candidates after R6/R7 proof:

| Table                                  | Decision       | Cleanup action now                                                |
| -------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `integrator.rubitime_api_throttle`     | drop_candidate | Drop only in migration-backed R7 after static no-reference proof. |
| `integrator.rubitime_booking_profiles` | drop_candidate | Drop only after archive/drop owner decision and restore proof.    |
| `integrator.rubitime_branches`         | drop_candidate | Drop only after archive/drop owner decision and restore proof.    |
| `integrator.rubitime_services`         | drop_candidate | Drop only after archive/drop owner decision and restore proof.    |
| `integrator.rubitime_cooperators`      | drop_candidate | Drop only after archive/drop owner decision and restore proof.    |

`integrator.rubitime_create_retry_jobs` is intentionally not in this table: it was never Rubitime raw provider
history, it was a legacy-named generic message-delivery retry queue (`kind='message.deliver'`; see
`20260310_0002_expand_retry_jobs_for_generic_delivery.sql`). Owner directive 2026-07-24: physically renamed to
`integrator.message_retry_jobs` now (not deferred to R7) --
`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`.
It is not a drop/defer candidate.

### Step 4. Resolve Remaining Raw Runtime References

Current remaining raw-table refs are not safe repo-only deletes. They define the future migration packet:

| Current ref area                                 | Required later action                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Integrator Drizzle schema declarations           | Remove/update only in the migration-backed R7 table drop/defer batch.                                                   |
| `integratorDomainRepos` raw table declarations   | Remove/update only after the tables are archived/dropped/deferred.                                                      |
| `integratorQueues` physical retry table mapping  | DONE 2026-07-24: renamed to `message_retry_jobs` (see the Drop/defer candidates note above).                            |
| `jobQueue` SQL against legacy retry storage      | DONE 2026-07-24: `jobQueue.ts` now queries `integrator.message_retry_jobs`.                                             |
| `platformUserFullPurge` strict raw-table cleanup | Keep until raw tables are dropped, then remove the cleanup branch in the same or immediately following migration batch. |

### Step 5. Migration Order For Future Execution

No destructive migration is created in this task. The future R7 worker should use this order:

1. Confirm R5 live-disable proof exists.
2. Confirm R6 cutoff/drain proof exists.
3. Run fresh post-R6 static inventory and schema audit.
4. Record owner archive/drop/defer decision.
5. Archive/export owner-approved tables and record checksums.
6. Create a repo migration that is explicit and reversible by archive/restore policy.
7. DONE 2026-07-24: `integrator.rubitime_create_retry_jobs` (provider-neutral retry storage) is renamed to
   `integrator.message_retry_jobs`; no longer a step here.
8. Drop only approved raw/provider tables.
9. Remove or update Drizzle/schema/runtime cleanup references that depended on dropped tables.
10. Run fresh restore + migrate proof on a TEST/disposable fresh-copy restore.
11. Save `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` with real command output.

### Step 6. Validation Order

Repo/prep validation for this task:

```bash
pnpm run check:rubitime-db-cleanup-sequence
pnpm run check:rubitime-retirement-current
pnpm run check:rubitime-r7-table-disposition
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
git diff --check
```

Future execution validation for R7:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs --require-complete
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs --require-drop-ready
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs --require-complete
```

`--require-complete` and `--require-drop-ready` are expected to fail before real R5/R6/R7 proof files exist.

### Step 7. Rollback And Restore Contract

Before destructive R7 execution, the proof must define:

- archive/export table list;
- archive directory and SHA256SUMS;
- missing-table evidence for optional public shadow tables;
- rollback horizon accepted by owner;
- whether rollback means full DB restore, table-level restore, or archive import;
- code rollback boundary after R6 route/code removal;
- confirmation that archive rows are not used as runtime state or new import input.

## SaaS Handoff Checklist

SaaS Foundation can proceed with planning and non-Rubitime implementation work when all of these are true:

- This sequence doc exists and `pnpm run check:rubitime-db-cleanup-sequence` passes.
- `pnpm run check:rubitime-retirement-current` passes.
- Fresh Rubitime CSV remains the preservation canon in all Rubitime retirement docs.
- R7 table disposition explicitly keeps `patient_bookings`, `be_external_entity_mappings`, `booking_calendar_map`, and
  public `booking_*` catalog compatibility outside raw Rubitime cleanup.
- Remaining raw-table refs are visible and classified; they are not hidden by scanners.
- No final proof placeholder files were created.
- No destructive migration was generated for this prep-only task.

SaaS Foundation full enforce must still wait for:

- R5 live-disable proof;
- R6 cutoff/drain proof;
- R7 archive/drop/defer proof or an owner-approved explicit defer policy;
- DB restore/migrate proof after any table drop migration;
- removal of Rubitime-specific quarantine from active SaaS/RLS descriptors.

## Quarantine That Remains After This Prep

- `public.appointment_records` remains archive/drop scope, not doctor/client runtime source.
- `integrator.rubitime_records` and `integrator.rubitime_events` remain raw archive scope, audit-only when CSV exists.
- DONE 2026-07-24: `integrator.rubitime_create_retry_jobs` (legacy physical storage name for provider-neutral retry
  jobs) is renamed to `integrator.message_retry_jobs`; no longer quarantined here.
- Drizzle/schema declarations remain until migration-backed R7 execution.
- Strict purge cleanup remains until the raw tables are dropped or deferred with a replacement cleanup policy.

## Handoff Status

Prepared by this package:

- TEST/disposable repo-first cleanup order;
- table disposition;
- archive/export policy;
- migration order;
- validation order;
- rollback/restore proof contract;
- SaaS handoff checklist.

Deferred to future owner-approved execution:

- live monitoring and flag acceptance;
- provider cutoff/drain;
- archive/export;
- destructive or defer migration;
- restore proof;
- final proof files.
