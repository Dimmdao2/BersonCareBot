# Rubitime retirement R1 blocker classification

Run id: `R1-BLOCKER-CLASSIFICATION-codex-2026-07-14`

Nickname: `blocker-classification`

Scope: owner-facing technical classification after fresh owner CSV proof. Aggregate-only, no row list, no PII, no `--commit`, no `--drop-stale-from-csv`, no `--drop-legacy`, no R2, no cleanup.

## Current rerun after fallback import

After the owner-confirmed historical specialist fallback import and the strict legacy-canceled cleanup rerun, the classifier was rerun read-only on the current dev DB snapshot.

Current remaining blockers:

| Blocker | Current count |
| --- | ---: |
| stale-vs-owner-CSV rows | 10 |
| stale rows with status `canceled` | 0 |
| stale active non-test rows | 10 |
| stale rows mapped to existing canonical | 9 |
| stale rows also inside duplicate clusters | 9 |
| unmapped real active rows | 1 |
| unmapped real active rows present in owner CSV | 0 |
| duplicate clusters | 3 |
| rows inside duplicate clusters | 11 |
| status mismatches | 4 |
| `record_at` mismatches | 2 |
| legacy-only rows | 312 |

Interpretation after fallback import:

- The old `99` active import blocker is reduced to `1`, and that remaining row is stale-vs-owner-CSV.
- All cleanup-eligible canceled/non-confirmed rows from the current script policy are exhausted.
- The remaining stale set is active-only: `10` rows are absent from the owner CSV, `9` are already mapped to canonical rows, and `9` overlap the remaining duplicate clusters.
- The next decision is stale/duplicate policy, not specialist mapping.

## Historical rerun after non-confirmed cleanup

After `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14`, the classifier was rerun read-only on the current dev DB snapshot.

Command:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Current remaining blockers:

| Blocker | Current count |
| --- | ---: |
| stale-vs-owner-CSV rows | 28 |
| stale rows with status `canceled` | 18 |
| stale active non-test rows | 10 |
| stale rows mapped to existing canonical | 27 |
| stale rows also inside duplicate clusters | 9 |
| unmapped real active rows | 99 |
| unmapped real active rows present in owner CSV | 98 |
| unmapped real active rows absent from integrator raw | 99 |
| duplicate clusters | 3 |
| rows inside duplicate clusters | 11 |
| status mismatches | 4 |
| `record_at` mismatches | 2 |
| legacy-only rows | 312 |

Interpretation after cleanup:

- The approved non-confirmed cleanup removed the easy status bucket; there are no remaining non-confirmed cleanup candidates from that flag.
- The remaining stale set is still mixed: `18` canceled rows and `10` active non-test rows. It must not be deleted as one blind bucket without owner/reviewer policy.
- The main import blocker is still the `99` active rows: `98` are present in the owner CSV, all `99` are absent from integrator raw, and all `99` miss specialist mapping/fallback.
- The remaining duplicate clusters are all non-canceled, mapped, and overlap stale rows; broad collapse is still unsafe.

## Environment

| Field | Value |
| --- | --- |
| Worktree | `/home/dev/dev-projects/BersonCareBot` |
| Branch | `feat/doctor-ui-rebuild` |
| Input HEAD | `03e2f941c85ca1573a57504e8b3adecebcf6207f` |
| Database | `bcb_webapp_dev` on `127.0.0.1:5432` |
| Env source | `.env` + `apps/webapp/.env.dev` |
| Script | `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs` |

## Historical original commands

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Result: PASS, read-only aggregate JSON. This was the original classification before later owner-approved cleanup/import passes. Original control counts matched the stale CSV proof at that time: `stale=29`, `unmapped_real_active=99`, `duplicate_clusters=3`, `status_mismatches=4`, `record_at_mismatches=2`.

## CSV shape

| Field | Value |
| --- | ---: |
| Basename | `records-2.csv` |
| Physical lines | 394 |
| Header fields | 22 |
| Parsed Rubitime ids | 392 |
| Date span | `2026-01-16...2026-08-29` |

## Historical original: 29 stale-vs-owner-CSV rows

These are live legacy rows inside the CSV date span and absent from the owner CSV.

| Bucket | Count |
| --- | ---: |
| Total | 29 |
| Status `canceled` | 19 |
| Status `created` | 10 |
| Active non-test | 10 |
| Test-like | 0 |
| Mapped to existing canonical | 28 |
| Unmapped | 1 |
| Present in integrator raw | 1 |
| Absent from integrator raw | 28 |
| Rows also inside duplicate clusters | 9 |

Month buckets:

| Month | Count |
| --- | ---: |
| 2026-01 | 6 |
| 2026-02 | 1 |
| 2026-03 | 6 |
| 2026-04 | 2 |
| 2026-05 | 2 |
| 2026-06 | 11 |
| 2026-07 | 1 |

Classification: this is not safe for automatic cleanup without owner approval. The stale set is not just canceled leftovers: `10` rows are active non-test, `28` already map to canonical rows, and `9` are part of still-open duplicate clusters.

## 99 unmapped real active rows

These rows are live, non-canceled, non-test-like, and have no canonical appointment mapping.

| Bucket | Count |
| --- | ---: |
| Total | 99 |
| Status `created` | 99 |
| Present in owner CSV | 98 |
| Absent within CSV range | 1 |
| Present in integrator raw | 0 |
| Absent from integrator raw | 99 |
| Duplicate overlap | 0 |
| Slot conflict detected | 0 |
| Recoverable existing canonical rows | 0 |
| Missing specialist mapping or fallback | 99 |

Month buckets:

| Month | Count |
| --- | ---: |
| 2026-01 | 29 |
| 2026-02 | 48 |
| 2026-03 | 19 |
| 2026-04 | 1 |
| 2026-05 | 1 |
| 2026-07 | 1 |

Current-script importability classification:

| Bucket | Count |
| --- | ---: |
| `script_may_insert_but_missing_specialist_mapping` | 98 |
| `blocked_stale_vs_owner_csv` | 1 |

Classification: the `98` CSV-present rows are likely real history, but they are not cleanly importable as accepted proof because every row lacks a resolved canonical specialist mapping/fallback. The current script may insert them, but that would risk canonical rows without specialist ownership. This needs a mapping/import fix or explicit owner exception before R1 can pass.

## 3 duplicate clusters

| Bucket | Count |
| --- | ---: |
| Clusters | 3 |
| Rows inside clusters | 11 |
| Shape `all_non_cancelled` | 3 |
| Mapped rows | 11 |
| Unmapped rows | 0 |
| Clusters with any stale row | 3 |
| Stale rows inside duplicate clusters | 9 |

Why broad collapse is unsafe:

| Reason | Count |
| --- | ---: |
| Clusters with non-canceled rows | 3 |
| Clusters with stale overlap | 3 |
| Clusters with mixed statuses | 0 |
| Clusters with unmapped rows | 0 |

Classification: these are not the previously approved canceled-loser cleanup case. All remaining clusters are non-canceled, fully mapped, and overlap stale-vs-CSV rows. Collapsing them would choose between live canonical history rows and stale cleanup policy at the same time, so it needs owner/reviewer decision.

## Mismatches

Status mismatches:

| Raw status | Legacy status | Count |
| --- | --- | ---: |
| `created` | `canceled` | 2 |
| `created` | `updated` | 2 |

`record_at` mismatches over 5 minutes:

| Direction | Count |
| --- | ---: |
| Legacy later than raw | 1 |
| Raw later than legacy | 1 |

Shared-row freshness:

| Direction | Count |
| --- | ---: |
| Legacy `updated_at` newer than raw by more than 5 minutes | 91 |
| Raw `updated_at` newer than legacy by more than 5 minutes | 0 |

Classification: for shared raw/public rows, public legacy projection is fresher overall, but four status disagreements and two appointment-time disagreements still need owner-approved source-of-truth policy or repair before R1 acceptance.

## Legacy-only 312 and mapping anomalies

Legacy-only means present in `public.appointment_records` and absent from `integrator.rubitime_records`.

| Bucket | Count |
| --- | ---: |
| Legacy-only total | 312 |
| Status `created` | 221 |
| Status `updated` | 19 |
| Status `canceled` | 72 |
| Mapped to existing canonical | 166 |
| Mapped to deleted canonical | 17 |
| Unmapped | 129 |

Month buckets:

| Month | Count |
| --- | ---: |
| 2026-01 | 37 |
| 2026-02 | 59 |
| 2026-03 | 29 |
| 2026-04 | 33 |
| 2026-05 | 63 |
| 2026-06 | 69 |
| 2026-07 | 15 |
| 2026-08 | 7 |

Overlap with other blockers:

| Overlap | Count |
| --- | ---: |
| Legacy-only and stale-vs-CSV | 28 |
| Legacy-only and unmapped real active | 99 |
| Legacy-only and duplicate rows | 9 |

Mapping anomaly buckets:

| Bucket | Count |
| --- | ---: |
| Unmapped legacy rows | 129 |
| Mapped to deleted canonical | 21 |
| Unexpected canonical source | 2 |
| Missing expected mapping metadata | 6 |

Classification: `legacy-only=312` is a raw-vs-public source discrepancy, not a raw-only import blocker. Raw-only is still zero. It blocks R1 because public legacy contains history that raw no longer has; owner must accept `appointment_records` as the history source for these rows, or require a separate archive/waiver/import policy. It materially overlaps the open blockers: all `99` unmapped real active rows and `28` of the stale rows are legacy-only.

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
