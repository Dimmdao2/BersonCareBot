# Rubitime retirement R1 cleanup run

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-CLEANUP-codex-2026-07-14`

Scope: R1 cleanup only after owner approval for test/block rows and canceled duplicate losers. No R2 work was started. All outputs below are aggregate-only and PII-safe.

## Environment

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Worktree       | `/home/dev/dev-projects/bcb-walls`                                     |
| Branch         | `auto/code-pg-delta`                                                   |
| Database       | `bcb_webapp_dev` on loopback                                           |
| Env source     | local dev env only                                                     |
| Telegram token | process-local non-secret placeholder, required only for config parsing |

## Exact cleanup flags

Dry-run:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --delete-test --collapse-canceled-dups --summary-only
```

Commit:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only
```

Not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`.

## Reusable cutover rule

This cleanup is now a scripted R1 cleanup path, not a manual SQL recipe. The row decisions made during this dev run must be encoded as script flags and owner-approved allowlists/fallback inputs; production cutover rehearsal must not manually reselect rows by hand.

Before production cutover, run the same script sequence on a fresh copy of the live database:

1. restore/sync the live DB copy into the approved non-prod environment;
2. migrate the copy to the current HEAD and require the clean-dump preflight below to pass;
3. run PII-safe dry-runs for the scripted cleanup/import sequence and save aggregate output;
4. run commit mode only after owner approval for that exact DB copy;
5. rerun the PII-safe classifier and dual-source audit after each meaningful step or at minimum after the sequence;
6. carry only the audited script + flags to the production runbook.

Fail-fast preflight (explicit loopback rehearsal URL; aggregate-only):

```bash
DATABASE_URL='<loopback-rehearsal-url>' \
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs \
  --csv=<fresh-rubitime-csv>
```

Do not start cleanup/import unless the result is `PASS`. The preflight rejects an old schema, a missing
owner CSV, and clean copies without canonical Rubitime projections, appointment/catalog mappings, active
specialist ownership, branch/service seed, or the settings rows used by the current backfill.

Current dev sequence to rehearse on the live DB copy:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only \
  --csv=<fresh-rubitime-csv>

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --historical-owner-doctor-phone=<owner-provided-phone> \
  --summary-only --csv=<fresh-rubitime-csv>

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only \
  --csv=<fresh-rubitime-csv>

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --drop-stale-from-csv --summary-only \
  --csv=<fresh-rubitime-csv>

node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=<fresh-rubitime-csv>

node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 --sample-size=0
```

Do not re-create this cleanup manually with ad hoc `UPDATE` statements. If another test marker is approved later, add it to the script allowlist, rerun the copy-DB rehearsal, and audit the new aggregate result before any production cutover.

## Cleanup behavior

- `--delete-test` soft-deleted owner-approved test/block legacy rows and their mapped canonical rows.
- `--collapse-canceled-dups` soft-deleted only canceled duplicate loser rows.
- For all-canceled duplicate clusters, the script keeps one representative and soft-deletes the rest.
- Non-canceled duplicate rows are never soft-deleted by `--collapse-canceled-dups`.
- `--cleanup-only` skipped tolerant projection and did not require the Rubitime bridge to be enabled.

## Before and after

| Check                                           |  Before |   After |
| ----------------------------------------------- | ------: | ------: |
| Legacy live rows                                |     400 |     364 |
| Canonical `rubitime_projection` live rows       |     258 |     241 |
| Unmapped legacy total                           |     126 |     112 |
| Unmapped test/block                             |      13 |       0 |
| Unmapped canceled                               |      20 |      13 |
| Unmapped real active                            |      99 |      99 |
| Unmapped future                                 |       0 |       0 |
| Duplicate clusters                              |       7 |       3 |
| Duplicate clusters with multiple canonical rows |       0 |       0 |
| Stale vs CSV                                    | skipped | skipped |

Commit effects:

| Action                                                   | Count |
| -------------------------------------------------------- | ----: |
| Test/block legacy rows soft-deleted                      |    34 |
| Mapped canonical rows soft-deleted by test/block cleanup |    21 |
| Duplicate clusters with canceled losers touched          |     2 |
| Canceled duplicate loser rows soft-deleted               |     2 |

## Post-cleanup dual-source audit

| Check                                                  |      Count |
| ------------------------------------------------------ | ---------: |
| raw-only records                                       |          0 |
| legacy-only records                                    |        312 |
| status mismatches                                      |          4 |
| `record_at` mismatches over 5 minutes                  |          2 |
| raw mapping coverage                                   |   91 of 91 |
| legacy mapping coverage                                | 274 of 403 |
| legacy unmapped                                        |        129 |
| legacy mappings to soft-deleted canonical appointments |         21 |
| unexpected canonical source                            |          6 |
| missing expected mapping metadata                      |          6 |

Interpretation: the approved cleanup removed the explicitly allowed test/block rows and narrowed duplicate clusters. It does not make `RR-PROOF-01-DUAL-SOURCE` pass.

## Remaining blockers before R2

- `UNMAPPED real active` remains 99.
- `DUPLICATE clusters` remains 3; broad duplicate collapse was not authorized and was not run.
- Stale-vs-CSV proof was later completed in `RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md`; dry-run result is 29 stale-vs-owner-CSV rows, with no cleanup commit authorized.
- Legacy-only records, status mismatches, record-time mismatches, and mapping anomalies still need owner/reviewer classification or explicit exceptions.
- Doctor calendar/list/KPI smoke is still not recorded.

## Second cleanup pass

Run id: `R1-CLEANUP-2-codex-2026-07-14`

Scope: second R1 cleanup-only pass after owner expanded the approved test/block categories. No R2 work was started. The script change only extended explicit phone and name-marker allowlists; it did not add fuzzy matching.

Exact flags:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --delete-test --collapse-canceled-dups --summary-only

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only

node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 --sample-size=0
```

Not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`.

Environment: `/home/dev/dev-projects/bcb-walls` on `auto/code-pg-delta`, dev DB `bcb_webapp_dev` on loopback, local dev env only, process-local non-secret Telegram placeholder for webapp config parsing.

### Second-pass before and after

| Check                                           |  Before |   After |
| ----------------------------------------------- | ------: | ------: |
| Legacy live rows                                |     364 |     364 |
| Canonical `rubitime_projection` live rows       |     241 |     241 |
| Unmapped legacy total                           |     112 |     112 |
| Unmapped test/block                             |       0 |       0 |
| Unmapped canceled                               |      13 |      13 |
| Unmapped real active                            |      99 |      99 |
| Unmapped future                                 |       0 |       0 |
| Duplicate clusters                              |       3 |       3 |
| Duplicate clusters with multiple canonical rows |       0 |       0 |
| Stale vs CSV                                    | skipped | skipped |

Second-pass commit effects:

| Action                                                   | Count |
| -------------------------------------------------------- | ----: |
| Test/block legacy rows soft-deleted                      |     0 |
| Mapped canonical rows soft-deleted by test/block cleanup |     0 |
| Duplicate clusters with canceled losers touched          |     0 |
| Canceled duplicate loser rows soft-deleted               |     0 |

Interpretation: the expanded approved categories were idempotent against the current dev snapshot. No additional rows were soft-deleted.

### Second-pass dual-source audit

| Check                                                  |      Count |
| ------------------------------------------------------ | ---------: |
| raw-only records                                       |          0 |
| legacy-only records                                    |        312 |
| status mismatches                                      |          4 |
| `record_at` mismatches over 5 minutes                  |          2 |
| raw mapping coverage                                   |   91 of 91 |
| legacy mapping coverage                                | 274 of 403 |
| legacy unmapped                                        |        129 |
| raw mappings to soft-deleted canonical appointments    |          4 |
| legacy mappings to soft-deleted canonical appointments |         21 |
| unexpected canonical source                            |          6 |
| missing expected mapping metadata                      |          6 |

Residual blockers remain, with stale proof now recorded separately in `RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md`; R1 remains blocked and R2 remains forbidden.

## Stale-vs-owner-CSV cleanup pass

Run id: `R1-STALE-CSV-CLEANUP-codex-2026-07-14`

Scope: owner-approved cleanup for all remaining legacy rows absent from the fresh owner Rubitime CSV while inside the CSV date range. No R2 work was started.

Important implementation note: before the commit run, `--drop-stale-from-csv` was made duplicate-safe for canonical rows. It soft-deletes every stale legacy row, but it does not soft-delete a canonical appointment if that same canonical row is still referenced by another live Rubitime mapping outside the stale id set. This avoids deleting the surviving canonical appointment for duplicate clusters.

Exact flags:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --drop-stale-from-csv --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --drop-stale-from-csv --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Commit effects:

| Action                              | Count |
| ----------------------------------- | ----: |
| stale legacy rows soft-deleted      |    10 |
| canonical appointments soft-deleted |     0 |

Post-cleanup summary:

| Check                                     | Count |
| ----------------------------------------- | ----: |
| Legacy live rows                          |   289 |
| Canonical `rubitime_projection` live rows |   287 |
| Unmapped legacy total                     |     0 |
| Unmapped real active                      |     0 |
| Duplicate clusters                        |     0 |
| Stale vs owner CSV                        |     0 |
| Non-confirmed cleanup candidates          |     0 |

Post-cleanup read-only classifier:

| Check                     | Count |
| ------------------------- | ----: |
| stale-vs-owner-CSV rows   |     0 |
| unmapped real active rows |     0 |
| duplicate clusters        |     0 |
| status mismatches         |     4 |
| `record_at` mismatches    |     2 |
| legacy-only rows          |   312 |

Residual blockers after this pass: legacy-only classification/waiver, status mismatch policy, record-time mismatch policy, mapping anomaly classification, and doctor calendar/list/KPI smoke.

## Fresh current dump replay

Run id: `R1-FRESH-DUMP-REPLAY-codex-2026-07-14-0415`

Scope: replay of the same owner-approved cleanup/import sequence on a disposable current prod dump after
`scripts/deploy-saas-667.sh` passed. No production DB, `bcb_webapp_dev`, TEST DB, live services or real
delivery channels were touched.

Input:

| Field             | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Dump              | `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_20260714_041501.dump` |
| Rehearsal DB      | `bcb_webapp_dev_rubitime_fresh_20260714_041501_owner2`                      |
| Owner CSV         | `records-2.csv`, 392 ids, 2026-01-16...2026-08-29                           |
| Migration wrapper | `scripts/deploy-saas-667.sh`                                                |

Exact R1 commit sequence:

```bash
pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only --csv=<owner-csv>

pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only --csv=<owner-csv>

pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --commit --historical-owner-doctor-phone=<owner-provided-phone> --summary-only --csv=<owner-csv>

pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only --csv=<owner-csv>

pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --drop-stale-from-csv --summary-only --csv=<owner-csv>
```

Fresh-copy final summary:

| Check                                     | Count |
| ----------------------------------------- | ----: |
| Legacy live rows                          |   268 |
| Canonical `rubitime_projection` live rows |   266 |
| Unmapped legacy total                     |     0 |
| Unmapped real active                      |     0 |
| Duplicate clusters                        |     0 |
| Stale vs owner CSV                        |     0 |
| Non-confirmed cleanup candidates          |     0 |
| Historical fallback rows inserted         |    98 |
| Test/block legacy rows soft-deleted       |    34 |
| Non-confirmed legacy rows soft-deleted    |    65 |
| Stale legacy rows soft-deleted            |     9 |

Post-replay read-only classifier:

| Check                     | Count |
| ------------------------- | ----: |
| stale-vs-owner-CSV rows   |     0 |
| unmapped real active rows |     0 |
| duplicate clusters        |     0 |
| status mismatches         |     4 |
| `record_at` mismatches    |     2 |
| legacy-only rows          |   290 |

Post-replay dual-source audit:

| Check                                                  |     Count |
| ------------------------------------------------------ | --------: |
| raw-only records                                       |         0 |
| legacy-only records                                    |       290 |
| raw mapping coverage                                   |   91 / 91 |
| legacy mapping coverage                                | 351 / 381 |
| legacy unmapped mappings                               |        30 |
| legacy mappings to soft-deleted canonical appointments |        74 |
| unexpected canonical source mappings                   |         6 |
| missing expected mapping metadata                      |         6 |

Interpretation: the cleanup/import sequence is now replay-proven on a fresh current prod dump. Remaining
R1 blockers are policy/smoke blockers, not stale/unmapped/duplicate cleanup blockers.

## Non-confirmed cleanup pass

Run id: `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14`

Scope: owner-approved cleanup for legacy Rubitime rows whose statuses are not confirmed/active/valid appointments. Detailed aggregate artifact: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_NON_CONFIRMED_CLEANUP.md`.

Exact flags:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --delete-non-confirmed --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv

pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Not used: `--drop-stale-from-csv`, `--drop-legacy`, `--collapse-dups`, R2, production env, `/opt`.

### Non-confirmed before and after

| Check                                     | Before | After |
| ----------------------------------------- | -----: | ----: |
| Legacy live rows                          |    364 |   317 |
| Canonical `rubitime_projection` live rows |    241 |   207 |
| Unmapped legacy total                     |    112 |    99 |
| Unmapped canceled                         |     13 |     0 |
| Unmapped real active                      |     99 |    99 |
| Duplicate clusters                        |      3 |     3 |
| Stale vs owner CSV `records-2.csv`        |     29 |    28 |
| Non-confirmed cleanup candidates          |     47 |     0 |

Commit effects:

| Action                                                   | Count |
| -------------------------------------------------------- | ----: |
| Non-confirmed legacy rows soft-deleted                   |    47 |
| Mapped canonical `rubitime_projection` rows soft-deleted |    34 |
| `canceled` status rows in this cleanup                   |    45 |
| `moved_awaiting` status rows in this cleanup             |     2 |

Post-pass dual-source audit: raw-only `0`, legacy-only `312`, status mismatches `4`, record-time mismatches `2`, legacy unmapped `129`, legacy mappings to soft-deleted canonical appointments `56`.

Residual blockers remained after this early partial pass: unmapped real active `99`, duplicate clusters `3`,
stale-vs-owner-CSV `28`, legacy-only `312`, mismatch/mapping classifications, and doctor calendar/list/KPI smoke.

Superseded status 2026-07-14: the later owner-approved cleanup/import replay on a fresh current dump closed the
stale/unmapped/duplicate buckets (`0/0/0`), the owner source-of-truth decision made fresh Rubitime CSV canon over
integrator raw mismatches, and `R1-DOCTOR-UI-SMOKE-codex-2026-07-14` recorded doctor calendar/list/KPI smoke PASS.
