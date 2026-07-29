# Rubitime retirement R1 owner review packet

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Scope: R1 owner review only. This packet is PII-safe and aggregate-only. It does not authorize R2.

## Status

R1 evidence collection and sanitized artifact audit: **PASS**.

Narrow owner-approved cleanup for test/block rows and canceled duplicate losers: **COMPLETED**.

Owner-approved cleanup for non-confirmed legacy Rubitime appointment statuses: **COMPLETED** in dev DB.

Owner-approved historical fallback import for pre-webapp active rows: **COMPLETED** in dev DB.

Owner-approved stale-vs-owner-CSV cleanup: **COMPLETED** in dev DB.

Fresh current dump replay: **COMPLETED** on disposable DB
`bcb_webapp_dev_rubitime_fresh_20260714_041501_owner2` from
`/opt/backups/postgres/hourly/unified_bcb_webapp_prod_20260714_041501.dump`; `#667` and R1 cleanup/import
sequence passed.

The approved cleanup path is scripted in `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts`.
It must be rehearsed on a fresh copy of the live database before production cutover; do not reproduce the cleanup with manual SQL.

Owner source-of-truth decision, 2026-07-14: **Rubitime export is the canon**. Anything present in the
fresh Rubitime CSV is needed; anything absent from that CSV is not needed. `integrator.rubitime_records` is
non-authoritative for R1 when the fresh Rubitime export exists; absence from integrator raw is not a blocker.
The R1 export is matched through existing city/branch mappings and the records are treated as one-specialist
history resolved through owner-provided doctor phone tail `9643805480`.

`RR-PROOF-01-DUAL-SOURCE`: **DATA PASS** after fresh replay and owner source-of-truth decision. Cleanup
buckets are closed; raw-vs-legacy disagreements are resolved by the Rubitime CSV rule. Doctor UI smoke is
still required before R1 acceptance.

R2 must not start until doctor calendar/list/KPI smoke is recorded or explicitly waived.

## Source Artifacts

- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_NON_CONFIRMED_CLEANUP.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_FALLBACK_SPECIALIST_IMPORT.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`

## Sanitized Facts

Dual-source audit:

| Fact                              |      Count |
| --------------------------------- | ---------: |
| raw-only records                  |          0 |
| legacy-only records               |        312 |
| status mismatches                 |          4 |
| record_at mismatches              |          2 |
| legacy mapping coverage           | 274 of 403 |
| legacy unmapped                   |        129 |
| unexpected canonical source       |          6 |
| missing expected mapping metadata |          6 |

Backfill dry-run, summary-only, before approved cleanup:

| Fact                                            |   Count |
| ----------------------------------------------- | ------: |
| unmapped legacy total                           |     126 |
| test/block bucket                               |      13 |
| cancelled bucket                                |      20 |
| real active bucket                              |      99 |
| future bucket                                   |       0 |
| duplicate clusters                              |       7 |
| duplicate clusters with multiple canonical rows |       0 |
| stale CSV check                                 | skipped |

Approved cleanup, summary-only, after commit:

| Fact                                            |   Count |
| ----------------------------------------------- | ------: |
| unmapped legacy total                           |     112 |
| test/block bucket                               |       0 |
| cancelled bucket                                |      13 |
| real active bucket                              |      99 |
| future bucket                                   |       0 |
| duplicate clusters                              |       3 |
| duplicate clusters with multiple canonical rows |       0 |
| stale CSV check                                 | skipped |

Owner-provided CSV stale proof, summary-only dry-run, after approved cleanup:

| Fact                |                   Count |
| ------------------- | ----------------------: |
| CSV basename        |         `records-2.csv` |
| CSV size            |            127600 bytes |
| CSV physical lines  |                     394 |
| parsed Rubitime ids |                     392 |
| CSV date span       | 2026-01-16...2026-08-29 |
| stale vs owner CSV  |                      29 |

Commit flags used: `--commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only`.

Not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`, stale cleanup commit mode.

Owner-approved non-confirmed cleanup, summary-only, after commit:

| Fact                                            | Count |
| ----------------------------------------------- | ----: |
| legacy live rows                                |   317 |
| canonical `rubitime_projection` live rows       |   207 |
| unmapped legacy total                           |    99 |
| unmapped cancelled bucket                       |     0 |
| unmapped real active bucket                     |    99 |
| duplicate clusters                              |     3 |
| duplicate clusters with multiple canonical rows |     0 |
| non-confirmed cleanup candidates                |     0 |
| stale vs owner CSV after this pass              |    28 |

Non-confirmed cleanup commit effects:

| Fact                                                     | Count |
| -------------------------------------------------------- | ----: |
| legacy rows soft-deleted                                 |    47 |
| mapped canonical `rubitime_projection` rows soft-deleted |    34 |
| `canceled` status rows affected                          |    45 |
| `moved_awaiting` status rows affected                    |     2 |

Additional commit flags used: `--commit --cleanup-only --delete-non-confirmed --summary-only`.

Still not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`, production env, `/opt`, R2.

Owner-approved historical fallback import and strict canceled cleanup, summary-only, after commit:

| Fact                                                | Count |
| --------------------------------------------------- | ----: |
| legacy live rows                                    |   299 |
| canonical `rubitime_projection` live rows           |   287 |
| unmapped legacy total                               |     1 |
| unmapped real active bucket                         |     1 |
| historical fallback rows inserted                   |    98 |
| strict canceled cleanup legacy rows soft-deleted    |    18 |
| strict canceled cleanup canonical rows soft-deleted |    18 |
| stale vs owner CSV after this pass                  |    10 |
| duplicate clusters                                  |     3 |
| non-confirmed cleanup candidates                    |     0 |

Additional commit flags used: `--commit --historical-owner-doctor-phone=<owner-provided-phone> --summary-only --csv=<owner-csv>` and `--commit --cleanup-only --delete-non-confirmed --summary-only --csv=<owner-csv>`.

Still not used after fallback import: `--drop-stale-from-csv`, `--drop-legacy`, broad `--collapse-dups`, production env, `/opt`, R2.

Owner-approved stale-vs-owner-CSV cleanup, summary-only, after commit:

| Fact                                      | Count |
| ----------------------------------------- | ----: |
| legacy live rows                          |   289 |
| canonical `rubitime_projection` live rows |   287 |
| stale legacy rows soft-deleted            |    10 |
| canonical appointments soft-deleted       |     0 |
| unmapped legacy total                     |     0 |
| unmapped real active bucket               |     0 |
| duplicate clusters                        |     0 |
| stale vs owner CSV after this pass        |     0 |
| non-confirmed cleanup candidates          |     0 |

Additional commit flags used: `--commit --cleanup-only --drop-stale-from-csv --summary-only --csv=<owner-csv>`.

R1 cleanup/import gates now closed in dev DB for stale/unmapped/duplicate blockers: `stale=0`, `unmapped_real_active=0`, `duplicate_clusters=0`. The later fresh replay plus owner source-of-truth decision resolves legacy-only/mismatch/mapping policy; doctor calendar/list/KPI smoke remains.

Fresh current dump replay, after `#667` and the same cleanup/import sequence:

| Fact                                                | Count |
| --------------------------------------------------- | ----: |
| stale-vs-owner-CSV rows                             |     0 |
| unmapped real active rows                           |     0 |
| duplicate clusters                                  |     0 |
| legacy-only rows                                    |   290 |
| legacy-only live rows mapped to existing canonical  |   195 |
| legacy-only deleted rows                            |    95 |
| live mapping to non-`rubitime_projection` canonical |     2 |
| status mismatches                                   |     4 |
| `record_at` mismatches                              |     2 |

Plain-language classification: `legacy-only=290` is not a cleanup backlog. It means the old public
`appointment_records` archive is richer than `integrator.rubitime_records`. The live part is already mapped
to canonical appointments; the unmapped part is already soft-deleted. The fresh Rubitime CSV decides which
rows are needed; absence from `integrator.rubitime_records` alone is not a reason to delete anything.

## Owner Decisions

| Decision                                                  | Options                                                                                                                                                                                                                                                                                           | Impact                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Classify legacy-only 290                                  | Accepted by owner source-of-truth rule: fresh Rubitime CSV is canon; `appointment_records` is the historical proof source where raw integrator mirror is incomplete/non-authoritative. All live legacy-only rows are mapped to canonical; all unmapped legacy-only rows are already soft-deleted. | Removes the misleading “290 dirty rows” blocker. No additional cleanup action proposed. |
| Classify 4 status mismatches and 2 `record_at` mismatches | Accepted by owner source-of-truth rule: Rubitime CSV / canonical projection wins over raw-vs-legacy disagreement.                                                                                                                                                                                 | No targeted repair packet required for R1.                                              |
| Handle unmapped legacy and backfill buckets               | Completed in fresh replay: unmapped real active = 0.                                                                                                                                                                                                                                              | No remaining unmapped cleanup blocker.                                                  |
| Resolve duplicate clusters                                | Completed in fresh replay: duplicate clusters = 0.                                                                                                                                                                                                                                                | No remaining duplicate cleanup blocker.                                                 |
| Classify stale-vs-CSV                                     | Completed in fresh replay: stale-vs-owner-CSV = 0.                                                                                                                                                                                                                                                | No remaining stale cleanup blocker.                                                     |
| Authorize backfill commit                                 | Completed for the owner-approved sequence and replayed on fresh dump. Broad `--collapse-dups` and ad hoc `--drop-legacy` remain unauthorized and unnecessary for this proof.                                                                                                                      | R1 data cleanup proof is replayed; policy/smoke items remain.                           |
| Classify 2 live native mappings                           | Accepted by owner source-of-truth rule if present in fresh Rubitime CSV; they are mapped to live canonical appointments and are not a cleanup target.                                                                                                                                             | No mapping repair required for R1 unless UI smoke proves a visible issue.               |
| Doctor calendar/list/KPI smoke acceptance                 | A: owner accepts targeted smoke after commit. B: require pre-commit visual/read-only smoke too. C: require broader doctor analytics smoke.                                                                                                                                                        | R1 acceptance cannot close without the agreed smoke surface passing or being waived.    |

## Hard Gate

Do not start R2 until all of the following are true:

- Owner decisions in this packet are resolved or explicitly accepted as R1 waivers.
- R1 execution-plan checklist is updated with accepted decisions or explicit exceptions.
- `RR-PROOF-01-DUAL-SOURCE` is no longer blocked.
- Any approved commit run has completed, or owner explicitly accepts a no-commit R1 exception.
- Doctor calendar/list/KPI smoke acceptance is recorded. **Done:** `R1-DOCTOR-UI-SMOKE-codex-2026-07-14`
  recorded PASS in `RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md`.

## Doctor UI Smoke

Run id: `R1-DOCTOR-UI-SMOKE-codex-2026-07-14`

Verdict: **PASS**.

The smoke was run on current local `bcb_webapp_dev` after read-only aggregate re-check because disposable clean-dump
mirror DBs had already been removed by owner request. The clean-dump data proof remains
`RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`.

Aggregate pre-check against owner CSV:

| Check                | Result |
| -------------------- | -----: |
| R1 preflight         |   PASS |
| Stale vs owner CSV   |      0 |
| Unmapped real active |      0 |
| Duplicate clusters   |      0 |
| Raw-only records     |      0 |

Doctor surfaces:

| Surface                                             | Result                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `/api/doctor/booking-engine/calendar` over CSV span | 200, `readSource=canonical`, 301 events                       |
| `/api/doctor/schedule-kpis` over CSV span           | 200                                                           |
| `/api/doctor/appointments/list?view=past&limit=50`  | 200, 47 rows returned                                         |
| `/app/doctor`                                       | 200                                                           |
| `/app/doctor/schedule?tab=cal`                      | 200                                                           |
| `/app/doctor/appointments`                          | 200 after expected redirect to `/app/doctor/schedule?tab=cal` |

Smoke-blocker fixes made during the run:

- Drizzle UUID audience exclusion now renders UUID-cast values instead of a text `notInArray` comparison.
- Canonical doctor appointment list now joins `package_usage_ref` text to `be_package_usages.id` through a guarded
  UUID cast.

Validation:

- `pnpm -C apps/webapp exec vitest run src/modules/analytics/analyticsAudience.test.ts src/infra/repos/pgDoctorCanonicalAppointments.test.ts`
- `pnpm -C apps/webapp run typecheck`

## Safe Command Templates

Read-only dual-source rerun, dev environment only:

```bash
# Load only approved dev env outside this template.
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=<minutes> \
  --sample-size=0
```

Read-only backfill dry-run, summary output only:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --summary-only
```

Read-only dry-run with owner-provided fresh CSV:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --summary-only \
  --csv=<fresh-csv-path>
```

Owner-approved commit template only:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit \
  <owner-approved-flags-only>
```

Do not use production env for these templates unless owner gives a separate production operation instruction through the server runbook.
