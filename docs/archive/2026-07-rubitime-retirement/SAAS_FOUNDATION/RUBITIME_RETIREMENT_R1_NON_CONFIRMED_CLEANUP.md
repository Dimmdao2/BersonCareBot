# Rubitime retirement R1 non-confirmed cleanup

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14`

Scope: owner-approved dev DB cleanup for legacy Rubitime appointment rows whose statuses are not confirmed/active/valid appointments. No production DB, no `/opt` env, no real sends, no R2 work, no Rubitime runtime/table removal.

Owner approval basis: cancellations, moves/reschedules and any statuses that are not confirmed appointments may be removed immediately, even when they are not duplicates.

## Environment

| Field          | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Worktree       | `/home/dev/dev-projects/BersonCareBot`                                                                    |
| Branch         | `feat/doctor-ui-rebuild`                                                                                  |
| Starting HEAD  | `03e2f941c85ca1573a57504e8b3adecebcf6207f`                                                                |
| Database       | `bcb_webapp_dev` on `127.0.0.1:5432`                                                                      |
| Env source     | `/home/dev/dev-projects/BersonCareBot/.env` + `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` |
| Telegram token | process-local non-secret placeholder, only for config parsing                                             |

## Scripted cleanup path

Implemented flag:

```bash
--delete-non-confirmed
```

Conservative status policy:

| Class                        | Statuses                                                         | Action                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| non-confirmed cleanup        | `canceled`, `awaiting_confirmation`, `in_cart`, `moved_awaiting` | soft-delete legacy row; soft-delete mapped canonical row only when `be_appointments.source='rubitime_projection'` |
| kept as valid/active history | `recorded`, `in_service`, `completed`, `awaiting_prepayment`     | no cleanup                                                                                                        |
| ambiguous / unknown          | any unresolved legacy status                                     | no cleanup                                                                                                        |

The flag is write-capable only with explicit `--commit`. It does not imply `--drop-stale-from-csv`, `--drop-legacy`, `--collapse-dups`, or R2.

## Exact commands

Dry-run, summary-only:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --delete-non-confirmed --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Commit, same scope:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --cleanup-only --delete-non-confirmed --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Post-run summary dry-run:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --cleanup-only --delete-non-confirmed --summary-only
```

Post-run stale CSV proof with owner CSV:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Post-run dual-source audit:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 \
  --sample-size=0
```

## Before and after

| Check                                           | Before | After |
| ----------------------------------------------- | -----: | ----: |
| Legacy live rows                                |    364 |   317 |
| Canonical `rubitime_projection` live rows       |    241 |   207 |
| Unmapped legacy total                           |    112 |    99 |
| Unmapped test/block                             |      0 |     0 |
| Unmapped canceled                               |     13 |     0 |
| Unmapped real active                            |     99 |    99 |
| Unmapped future                                 |      0 |     0 |
| Duplicate clusters                              |      3 |     3 |
| Duplicate clusters with multiple canonical rows |      0 |     0 |
| Stale vs owner CSV `records-2.csv`              |     29 |    28 |
| Non-confirmed cleanup candidates                |     47 |     0 |

Commit effects:

| Action                                                   | Count |
| -------------------------------------------------------- | ----: |
| Non-confirmed legacy rows soft-deleted                   |    47 |
| Mapped canonical `rubitime_projection` rows soft-deleted |    34 |
| `canceled` status rows in this cleanup                   |    45 |
| `moved_awaiting` status rows in this cleanup             |     2 |

## Post-run dual-source audit

| Check                                                  |      Count |
| ------------------------------------------------------ | ---------: |
| raw-only records                                       |          0 |
| legacy-only records                                    |        312 |
| status mismatches                                      |          4 |
| `record_at` mismatches over 5 minutes                  |          2 |
| raw mapping coverage                                   |   91 of 91 |
| legacy mapping coverage                                | 274 of 403 |
| legacy unmapped                                        |        129 |
| raw mappings to soft-deleted canonical appointments    |         17 |
| legacy mappings to soft-deleted canonical appointments |         56 |
| unexpected canonical source                            |          6 |
| missing expected mapping metadata                      |          6 |

Interpretation: the owner-approved non-confirmed category is now exhausted in the dev DB snapshot. This does not make R1 pass.

## Explicit no-go / not performed

- No production DB was touched.
- No `/opt/env` files were read.
- No real sends were triggered.
- No `--drop-stale-from-csv` was run.
- No `--drop-legacy` was run.
- No broad stale cleanup was performed.
- No broad duplicate collapse was performed.
- No R2 work was started.
- No Rubitime tables/runtime were dropped or disabled.

## Remaining blockers

- `UNMAPPED real active` remains 99.
- Duplicate clusters remain 3; broad duplicate collapse is still not authorized.
- Stale-vs-owner-CSV remains 28 rows after this pass; broad stale cleanup is still not authorized.
- Legacy-only records remain 312.
- Status mismatches remain 4.
- `record_at` mismatches remain 2.
- Mapping anomalies still need classification or explicit owner-approved exceptions.
- Doctor calendar/list/KPI smoke is still not recorded.
- `RR-PROOF-01-DUAL-SOURCE` remains blocked and R2 remains forbidden.
