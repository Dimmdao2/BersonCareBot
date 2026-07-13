# Rubitime retirement R1 owner review packet

Scope: R1 owner review only. This packet is PII-safe and aggregate-only. It does not authorize R2.

## Status

R1 evidence collection and sanitized artifact audit: **PASS**.

Narrow owner-approved cleanup for test/block rows and canceled duplicate losers: **COMPLETED**.

The approved cleanup path is scripted in `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts`.
It must be rehearsed on a fresh copy of the live database before production cutover; do not reproduce the cleanup with manual SQL.

`RR-PROOF-01-DUAL-SOURCE`: **BLOCKED** until owner decisions below are resolved and R1 acceptance is updated in the execution plan.

R2 must not start while this packet has unresolved decisions.

## Source Artifacts

- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`

## Sanitized Facts

Dual-source audit:

| Fact | Count |
| --- | ---: |
| raw-only records | 0 |
| legacy-only records | 312 |
| status mismatches | 4 |
| record_at mismatches | 2 |
| legacy mapping coverage | 274 of 403 |
| legacy unmapped | 129 |
| unexpected canonical source | 6 |
| missing expected mapping metadata | 6 |

Backfill dry-run, summary-only, before approved cleanup:

| Fact | Count |
| --- | ---: |
| unmapped legacy total | 126 |
| test/block bucket | 13 |
| cancelled bucket | 20 |
| real active bucket | 99 |
| future bucket | 0 |
| duplicate clusters | 7 |
| duplicate clusters with multiple canonical rows | 0 |
| stale CSV check | skipped |

Approved cleanup, summary-only, after commit:

| Fact | Count |
| --- | ---: |
| unmapped legacy total | 112 |
| test/block bucket | 0 |
| cancelled bucket | 13 |
| real active bucket | 99 |
| future bucket | 0 |
| duplicate clusters | 3 |
| duplicate clusters with multiple canonical rows | 0 |
| stale CSV check | skipped |

Commit flags used: `--commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only`.

Not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`.

## Owner Decisions

| Decision | Options | Impact |
| --- | --- | --- |
| Classify legacy-only 312 | A: import or map as valid history. B: waive as legacy-only archive with reason. C: split by bucket after reviewer analysis. | Until classified, R1 cannot prove complete canonical history and R2 remains blocked. |
| Classify 4 status mismatches and 2 record_at mismatches | A: canonical is correct. B: legacy projection is correct and needs repair. C: accept documented historical divergence. | Determines whether follow-up import or manual repair is required before acceptance. |
| Handle unmapped legacy and backfill unmapped buckets | B partial completed: approved test/block rows were soft-deleted. Remaining: A map/import valid records or C leave approved exceptions with owner reason. | Acceptance requires unmapped zero or explicit owner-approved exceptions. |
| Resolve duplicate clusters 7 | C partial completed: canceled duplicate losers were soft-deleted only. Remaining 3 clusters require a separate owner decision. | Prevents double counting in calendar, list, KPI, and future migration proof. |
| Approve stale CSV proof source | A: provide a current CSV path and date. B: waive CSV stale proof for R1 with reason. C: require rerun with fresh CSV before any commit. | Stale proof remains incomplete while the CSV source is absent or unapproved. |
| Authorize backfill commit | Narrow cleanup commit completed with `--cleanup-only --delete-test --collapse-canceled-dups`. Other commit modes remain unauthorized. | This resolved only the approved cleanup categories; broad projection/collapse/stale/drop-legacy remain gated. |
| Doctor calendar/list/KPI smoke acceptance | A: owner accepts targeted smoke after commit. B: require pre-commit visual/read-only smoke too. C: require broader doctor analytics smoke. | R1 acceptance cannot close without the agreed smoke surface passing or being waived. |

## Hard Gate

Do not start R2 until all of the following are true:

- Owner decisions in this packet are resolved.
- R1 execution-plan checklist is updated with accepted decisions or explicit exceptions.
- `RR-PROOF-01-DUAL-SOURCE` is no longer blocked.
- Any approved commit run has completed, or owner explicitly accepts a no-commit R1 exception.
- Doctor calendar/list/KPI smoke acceptance is recorded.

## Safe Command Templates

Read-only dual-source rerun, dev environment only:

```bash
# Load only approved dev env outside this template.
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
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
