# Rubitime retirement R1 dual-source report

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-DUAL-SOURCE-HISTORY-codex-2026-07-14-proof-runner`

Scope: Phase R1 proof/evidence. The original proof runner was read-only/dry-run with no SQL writes, no `/opt` env, no production DB, and no PII output. The later narrow cleanup commit is documented separately below. R2 was not started.

## Artifacts

- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt`
- Cleanup run: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`
- Stale CSV proof: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md`
- Owner review packet: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md`

These artifacts use aggregate output only. Dual-source samples were disabled with `--sample-size=0`. Backfill was run with `--summary-only`, which suppresses names, phones, external ids and detail rows.

## Dual-source audit result

Command shape:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs --threshold-minutes=5 --sample-size=0
```

Sanitized result summary:

| Check                                                     |                               Result |
| --------------------------------------------------------- | -----------------------------------: |
| connected DB                                              | `bcb_webapp_dev` on `127.0.0.1:5432` |
| raw rows with external id (`integrator.rubitime_records`) |                                   91 |
| legacy rows with external id (`appointment_records`)      |                                  403 |
| shared external ids                                       |                                   91 |
| raw-only ids                                              |                                    0 |
| legacy-only ids                                           |                                  312 |
| status mismatches                                         |                                    4 |
| `record_at` mismatches over 5 minutes                     |                                    2 |
| raw newer than legacy by threshold                        |                                    0 |
| legacy newer than raw by threshold                        |                                   91 |
| raw mapping coverage                                      |                       91 / 91 mapped |
| legacy mapping coverage                                   |       274 / 403 mapped; 129 unmapped |
| mapping/canonical org mismatches                          |                                    0 |
| mapping orphans without canonical appointment             |                                    0 |
| unexpected canonical source in mappings                   |                                    6 |
| missing expected mapping metadata                         |                                    6 |

Freshness:

| Source                          | max `record_at`                       | max `updated_at`                   |
| ------------------------------- | ------------------------------------- | ---------------------------------- |
| `appointment_records`           | `2026-08-29T18:00:00+02:00`           | `2026-07-06T00:19:45.183+02:00`    |
| `integrator.rubitime_records`   | `2026-04-21T15:00:00+02:00`           | `2026-04-13T20:45:52.113479+02:00` |
| canonical `rubitime_projection` | max start `2026-08-29T18:00:00+02:00` | n/a                                |

Interpretation: the direct raw source has no records missing from legacy (`raw_only_count=0`), so no raw-only import is needed before owner review. R1 is still not passable: legacy has 312 ids absent from raw, 129 legacy rows are unmapped to canonical, and there are status/freshness differences that need owner/reviewer classification.

## Backfill dry-run result

The existing backfill script was updated with a report-only flag:

- `--summary-only`
- alias: `--pii-safe`

The flag suppresses detail rows in duplicate/stale/conflict sections and leaves all write behavior gated exactly as before by `--commit`.

Initial dry-run with the requested dev env failed before DB work because webapp config requires a non-empty `TELEGRAM_BOT_TOKEN`, while the safe dev env keeps send credentials empty. The successful proof run used a process-local non-secret parser placeholder:

```bash
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real
```

No real credential was used, and no delivery path was invoked.

Sanitized dry-run summary:

| Check                                           |                                   Result |
| ----------------------------------------------- | ---------------------------------------: |
| mode                                            |                    `DRY-RUN (read-only)` |
| Rubitime bridge enabled                         |                                  `false` |
| CSV stale detection                             | skipped; CSV not present at default path |
| legacy live rows                                |                                      400 |
| canonical `rubitime_projection` live rows       |                                      258 |
| unmapped legacy total                           |                                      126 |
| unmapped test/block                             |                                       13 |
| unmapped cancelled                              |                                       20 |
| unmapped real active                            |                                       99 |
| unmapped future                                 |                                        0 |
| duplicate clusters                              |                                        7 |
| duplicate clusters with multiple canonical rows |                                        0 |
| stale vs CSV                                    |                            not evaluated |

Later R1 cleanup note: owner approved a narrow cleanup for test/block rows and canceled duplicate losers. The cleanup used `--commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only`; it did not use `--collapse-dups`, `--drop-stale-from-csv`, or `--drop-legacy`. Post-cleanup summary: unmapped legacy `112`, test/block `0`, canceled `13`, real active `99`, duplicate clusters `3`.

Stale CSV proof note: `R1-STALE-CSV-PROOF-codex-2026-07-14` used owner-provided `records-2.csv` (`394` physical lines, `127600` bytes, `392` parsed Rubitime ids, CSV date span `2026-01-16...2026-08-29`) in `--summary-only` dry-run mode. The later owner-approved cleanup pass soft-deleted the remaining `10` stale legacy rows after fallback import and non-confirmed cleanup. Post-cleanup stale/unmapped/duplicate counts are all zero. See `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`.

## Commands run

| Command                                                                                                                                          | Result                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pwd && git status --short --branch && git rev-parse HEAD`                                                                                       | PASS. Worktree `/home/dev/dev-projects/bcb-walls`, branch `auto/code-pg-delta`, starting HEAD `5c348afd47253984806238cb27bee0d18cf3e006`. |
| Required docs/rules reads (`AGENTS.md`, `docs/ORCHESTRATION_BINDINGS.md`, plan R1/RR-PROOF-01, required `.cursor/rules/*`, core onboarding docs) | PASS.                                                                                                                                     |
| `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs --help`                                                               | PASS.                                                                                                                                     |
| dual-source audit with safe dev env and `--sample-size=0`                                                                                        | PASS; JSON artifact saved.                                                                                                                |
| first backfill dry-run with safe dev env and `--summary-only`                                                                                    | BLOCKED before SQL by required non-empty `TELEGRAM_BOT_TOKEN`.                                                                            |
| backfill dry-run with safe dev env, process-local non-secret `TELEGRAM_BOT_TOKEN`, and `--summary-only`                                          | PASS; summary artifact saved.                                                                                                             |
| `node --check docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`                                                              | PASS.                                                                                                                                     |

## R1 checklist status

Closed by this proof run:

- `appointment_records` vs `integrator.rubitime_records` anti-join is run.
- max `record_at` / freshness comparison is recorded for both sources.
- raw-only delta is zero; no raw-only import or waiver is needed from this result.
- canonical mapping coverage is recorded.
- `backfill-canonical-from-legacy-appointments` dry-run output is saved in PII-safe mode.

Open / blocked:

- legacy-only records are not owner-classified.
- status/freshness mismatches are counted but not owner-classified.
- owner has not reviewed `UNMAPPED`, `DUPLICATE`, `STALE`, `CONFLICTS`.
- narrow cleanup commit was approved and run; broader projection/collapse/stale/drop-legacy commit modes remain unauthorized.
- post-run diagnosis does not show `UNMAPPED 0`, `DUPLICATE 0`, `STALE 0`, and `CONFLICTS 0`.
- doctor calendar/list/KPI smoke was not run.
- stale-by-CSV proof is now available, but its `29` rows are not owner-classified and cleanup remains unauthorized.

## RR-PROOF-01-DUAL-SOURCE

Status: **BLOCKED**

Reason: read-only R1 evidence was collected, the later narrow cleanup was completed, and owner-provided CSV stale proof was run. Acceptance is still not met. Remaining blockers are unresolved legacy-only/mismatch classification, unmapped canonical coverage, duplicate clusters, stale-vs-CSV classification/approval, owner review, doctor smoke, and unauthorized broader commit modes.
