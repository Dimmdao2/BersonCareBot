# Rubitime retirement R1 blocker classification

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-BLOCKER-CLASSIFICATION-codex-2026-07-14`

Nickname: `blocker-classification`

Scope: owner-facing technical classification after fresh owner CSV proof. Aggregate-only, no row list, no PII, no `--commit`, no `--drop-stale-from-csv`, no `--drop-legacy`, no R2, no cleanup.

## Fresh current dump replay classification

Run id: `R1-FRESH-DUMP-REPLAY-codex-2026-07-14-0415`

This supersedes the older dev-only counts below for R1 acceptance. It was run on the disposable fresh-copy DB
after `scripts/deploy-saas-667.sh` and the owner-approved R1 cleanup/import sequence passed.

Plain-language result: the `legacy-only=290` count is **not 290 dirty visible appointments**. It means
`public.appointment_records` has historical rows that are absent from `integrator.rubitime_records`. After
the fresh replay:

| Legacy-only split                      |   Count | Meaning                                                |
| -------------------------------------- | ------: | ------------------------------------------------------ |
| live + mapped to existing canonical    |     195 | already represented in canonical history               |
| deleted + mapped to deleted canonical  |      57 | already soft-deleted cleanup residue                   |
| deleted + mapped to existing canonical |       8 | deleted legacy row points to a surviving canonical row |
| deleted + unmapped                     |      30 | already soft-deleted legacy-only residue               |
| **total**                              | **290** | source-archive gap, not a cleanup bucket               |

Owner decision recorded 2026-07-14: **Rubitime export is the canon**. Anything present in the fresh
Rubitime CSV is needed; anything absent from that CSV is not needed. `integrator.rubitime_records` is
explicitly non-authoritative for R1 acceptance when a fresh Rubitime export exists. It may be kept as an
audit signal only; absence from integrator raw is not a blocker and must not drive cleanup.

Operational scope recorded by owner:

- match the fresh Rubitime export through the existing city/branch mappings;
- these R1 history records belong to one specialist, resolved through the owner-provided doctor phone tail
  `9643805480`;
- do not invent an extra specialist split from incomplete raw integrator data.

Residual acceptance items after this split:

| Item                                                | Current count | Classification                                                                 |
| --------------------------------------------------- | ------------: | ------------------------------------------------------------------------------ |
| stale-vs-owner-CSV rows                             |             0 | closed                                                                         |
| unmapped real active rows                           |             0 | closed                                                                         |
| duplicate clusters                                  |             0 | closed                                                                         |
| status mismatches                                   |             4 | accepted as raw-vs-legacy divergence; Rubitime CSV / canonical projection wins |
| `record_at` mismatches                              |             2 | accepted as raw-vs-legacy divergence; Rubitime CSV / canonical projection wins |
| live mapping to non-`rubitime_projection` canonical |             2 | accepted if present in Rubitime CSV; not a cleanup target                      |

Mapping anomaly clarification:

| Reported anomaly bucket           | Count | Live impact                            |
| --------------------------------- | ----: | -------------------------------------- |
| mapped to deleted canonical       |    74 | all 74 are already deleted legacy rows |
| unmapped legacy rows              |    30 | all 30 are already deleted legacy rows |
| missing expected mapping metadata |     6 | 4 deleted/native, 2 live/native        |
| unexpected canonical source       |     2 | the only live mapping-policy residue   |

R1 decision: accept `appointment_records` + the owner CSV as the historical proof source. All live
legacy-only rows are already mapped to canonical appointments; all unmapped legacy-only rows are already
soft-deleted. Do not delete legacy-only rows merely because `integrator.rubitime_records` lacks them.

## Historical dev rerun after fallback import — superseded

This section is retained as historical evidence only. It is superseded by the fresh current dump replay and
the owner source-of-truth decision above.

After the owner-confirmed historical specialist fallback import and the strict legacy-canceled cleanup rerun, the classifier was rerun read-only on the current dev DB snapshot.

Current remaining blockers:

| Blocker                                        | Current count |
| ---------------------------------------------- | ------------: |
| stale-vs-owner-CSV rows                        |             0 |
| stale rows with status `canceled`              |             0 |
| stale active non-test rows                     |             0 |
| stale rows mapped to existing canonical        |             0 |
| stale rows also inside duplicate clusters      |             0 |
| unmapped real active rows                      |             0 |
| unmapped real active rows present in owner CSV |             0 |
| duplicate clusters                             |             0 |
| rows inside duplicate clusters                 |             0 |
| status mismatches                              |             4 |
| `record_at` mismatches                         |             2 |
| legacy-only rows                               |           312 |

Interpretation after fallback import and owner-approved stale cleanup:

- The old `99` active import blocker is closed.
- The remaining stale-vs-owner-CSV rows were owner-approved for cleanup and are now zero.
- Duplicate clusters are now zero because the duplicate overlap was stale-only legacy residue.
- Historical interpretation at that point: the next decisions were source-of-truth policy items and doctor
  smoke. Source-of-truth is now decided above: fresh Rubitime export is canon.

## Historical rerun after non-confirmed cleanup

After `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14`, the classifier was rerun read-only on the current dev DB snapshot.

Command:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Current remaining blockers:

| Blocker                                              | Current count |
| ---------------------------------------------------- | ------------: |
| stale-vs-owner-CSV rows                              |            28 |
| stale rows with status `canceled`                    |            18 |
| stale active non-test rows                           |            10 |
| stale rows mapped to existing canonical              |            27 |
| stale rows also inside duplicate clusters            |             9 |
| unmapped real active rows                            |            99 |
| unmapped real active rows present in owner CSV       |            98 |
| unmapped real active rows absent from integrator raw |            99 |
| duplicate clusters                                   |             3 |
| rows inside duplicate clusters                       |            11 |
| status mismatches                                    |             4 |
| `record_at` mismatches                               |             2 |
| legacy-only rows                                     |           312 |

Interpretation after cleanup:

- The approved non-confirmed cleanup removed the easy status bucket; there are no remaining non-confirmed cleanup candidates from that flag.
- The remaining stale set is still mixed: `18` canceled rows and `10` active non-test rows. It must not be deleted as one blind bucket without owner/reviewer policy.
- The main import blocker is still the `99` active rows: `98` are present in the owner CSV, all `99` are absent from integrator raw, and all `99` miss specialist mapping/fallback.
- The remaining duplicate clusters are all non-canceled, mapped, and overlap stale rows; broad collapse is still unsafe.

## Environment

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Worktree   | `/home/dev/dev-projects/BersonCareBot`                                 |
| Branch     | `feat/doctor-ui-rebuild`                                               |
| Input HEAD | `03e2f941c85ca1573a57504e8b3adecebcf6207f`                             |
| Database   | `bcb_webapp_dev` on `127.0.0.1:5432`                                   |
| Env source | `.env` + `apps/webapp/.env.dev`                                        |
| Script     | `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs` |

## Historical original commands

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Result: PASS, read-only aggregate JSON. This was the original classification before later owner-approved cleanup/import passes. Original control counts matched the stale CSV proof at that time: `stale=29`, `unmapped_real_active=99`, `duplicate_clusters=3`, `status_mismatches=4`, `record_at_mismatches=2`.

## CSV shape

| Field               |                     Value |
| ------------------- | ------------------------: |
| Basename            |           `records-2.csv` |
| Physical lines      |                       394 |
| Header fields       |                        22 |
| Parsed Rubitime ids |                       392 |
| Date span           | `2026-01-16...2026-08-29` |

## Historical original: 29 stale-vs-owner-CSV rows

These are live legacy rows inside the CSV date span and absent from the owner CSV.

| Bucket                              | Count |
| ----------------------------------- | ----: |
| Total                               |    29 |
| Status `canceled`                   |    19 |
| Status `created`                    |    10 |
| Active non-test                     |    10 |
| Test-like                           |     0 |
| Mapped to existing canonical        |    28 |
| Unmapped                            |     1 |
| Present in integrator raw           |     1 |
| Absent from integrator raw          |    28 |
| Rows also inside duplicate clusters |     9 |

Month buckets:

| Month   | Count |
| ------- | ----: |
| 2026-01 |     6 |
| 2026-02 |     1 |
| 2026-03 |     6 |
| 2026-04 |     2 |
| 2026-05 |     2 |
| 2026-06 |    11 |
| 2026-07 |     1 |

Classification: this is not safe for automatic cleanup without owner approval. The stale set is not just canceled leftovers: `10` rows are active non-test, `28` already map to canonical rows, and `9` are part of still-open duplicate clusters.

## 99 unmapped real active rows

These rows are live, non-canceled, non-test-like, and have no canonical appointment mapping.

| Bucket                                 | Count |
| -------------------------------------- | ----: |
| Total                                  |    99 |
| Status `created`                       |    99 |
| Present in owner CSV                   |    98 |
| Absent within CSV range                |     1 |
| Present in integrator raw              |     0 |
| Absent from integrator raw             |    99 |
| Duplicate overlap                      |     0 |
| Slot conflict detected                 |     0 |
| Recoverable existing canonical rows    |     0 |
| Missing specialist mapping or fallback |    99 |

Month buckets:

| Month   | Count |
| ------- | ----: |
| 2026-01 |    29 |
| 2026-02 |    48 |
| 2026-03 |    19 |
| 2026-04 |     1 |
| 2026-05 |     1 |
| 2026-07 |     1 |

Current-script importability classification:

| Bucket                                             | Count |
| -------------------------------------------------- | ----: |
| `script_may_insert_but_missing_specialist_mapping` |    98 |
| `blocked_stale_vs_owner_csv`                       |     1 |

Classification: the `98` CSV-present rows are likely real history, but they are not cleanly importable as accepted proof because every row lacks a resolved canonical specialist mapping/fallback. The current script may insert them, but that would risk canonical rows without specialist ownership. This needs a mapping/import fix or explicit owner exception before R1 can pass.

## 3 duplicate clusters

| Bucket                               | Count |
| ------------------------------------ | ----: |
| Clusters                             |     3 |
| Rows inside clusters                 |    11 |
| Shape `all_non_cancelled`            |     3 |
| Mapped rows                          |    11 |
| Unmapped rows                        |     0 |
| Clusters with any stale row          |     3 |
| Stale rows inside duplicate clusters |     9 |

Why broad collapse is unsafe:

| Reason                          | Count |
| ------------------------------- | ----: |
| Clusters with non-canceled rows |     3 |
| Clusters with stale overlap     |     3 |
| Clusters with mixed statuses    |     0 |
| Clusters with unmapped rows     |     0 |

Classification: these are not the previously approved canceled-loser cleanup case. All remaining clusters are non-canceled, fully mapped, and overlap stale-vs-CSV rows. Collapsing them would choose between live canonical history rows and stale cleanup policy at the same time, so it needs owner/reviewer decision.

## Mismatches

Status mismatches:

| Raw status | Legacy status | Count |
| ---------- | ------------- | ----: |
| `created`  | `canceled`    |     2 |
| `created`  | `updated`     |     2 |

`record_at` mismatches over 5 minutes:

| Direction             | Count |
| --------------------- | ----: |
| Legacy later than raw |     1 |
| Raw later than legacy |     1 |

Shared-row freshness:

| Direction                                                 | Count |
| --------------------------------------------------------- | ----: |
| Legacy `updated_at` newer than raw by more than 5 minutes |    91 |
| Raw `updated_at` newer than legacy by more than 5 minutes |     0 |

Classification: for shared raw/public rows, public legacy projection is fresher overall, but four status disagreements and two appointment-time disagreements still need owner-approved source-of-truth policy or repair before R1 acceptance.

## Legacy-only 312 and mapping anomalies

Legacy-only means present in `public.appointment_records` and absent from `integrator.rubitime_records`.

| Bucket                       | Count |
| ---------------------------- | ----: |
| Legacy-only total            |   312 |
| Status `created`             |   221 |
| Status `updated`             |    19 |
| Status `canceled`            |    72 |
| Mapped to existing canonical |   166 |
| Mapped to deleted canonical  |    17 |
| Unmapped                     |   129 |

Month buckets:

| Month   | Count |
| ------- | ----: |
| 2026-01 |    37 |
| 2026-02 |    59 |
| 2026-03 |    29 |
| 2026-04 |    33 |
| 2026-05 |    63 |
| 2026-06 |    69 |
| 2026-07 |    15 |
| 2026-08 |     7 |

Overlap with other blockers:

| Overlap                              | Count |
| ------------------------------------ | ----: |
| Legacy-only and stale-vs-CSV         |    28 |
| Legacy-only and unmapped real active |    99 |
| Legacy-only and duplicate rows       |     9 |

Mapping anomaly buckets:

| Bucket                            | Count |
| --------------------------------- | ----: |
| Unmapped legacy rows              |   129 |
| Mapped to deleted canonical       |    21 |
| Unexpected canonical source       |     2 |
| Missing expected mapping metadata |     6 |

Historical classification before the fresh replay and owner source-of-truth decision: `legacy-only=312` was
a raw-vs-public source discrepancy, not a raw-only import blocker. This is superseded by the fresh replay:
fresh Rubitime export is canon, `integrator.rubitime_records` is non-authoritative, stale/unmapped/duplicate
buckets are closed, and `legacy-only=290` is not a cleanup backlog.

## Real blockers

1. `29` stale-vs-owner-CSV rows are not a uniform cleanup bucket: active mapped rows and duplicate-cluster rows are present.
2. `99` unmapped real active rows are almost all present in the owner CSV but absent from integrator raw; all need specialist mapping/import handling or explicit exceptions.
3. Remaining duplicate clusters are all non-canceled and mapped, with stale overlap; broad collapse is unsafe.
4. Shared raw/public mismatches are small but directional policy is unresolved: raw says `created`, while legacy says `canceled` or `updated` for four rows.
5. `legacy-only=312` proves integrator raw is incomplete compared with public legacy for R1 history proof; this is an owner decision, not an automatic cleanup target.

## What owner can approve next

- Approve scripted stale cleanup only after accepting the mixed active/mapped/duplicate nature of the `29` stale rows.
- Approve a mapping/import fix for the `98` CSV-present unmapped active rows, or approve explicit exceptions with reason.
- Approve duplicate-cluster handling separately from canceled-loser cleanup.
- Declare source-of-truth policy for the `4` status mismatches and `2` `record_at` mismatches.
- Accept `public.appointment_records` as the history source for legacy-only rows, or require a separate archive/waiver policy.

## Must not be auto-cleaned

- Do not run `--commit`, `--drop-stale-from-csv`, `--drop-legacy`, or broad `--collapse-dups` from this classification.
- Do not treat legacy-only rows as removable because they are absent from integrator raw.
- Do not start R2 or any runtime/table cleanup from this artifact.
