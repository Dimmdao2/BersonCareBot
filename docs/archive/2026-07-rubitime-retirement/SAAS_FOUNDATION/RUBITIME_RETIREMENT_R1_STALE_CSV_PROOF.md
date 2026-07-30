# Rubitime retirement R1 stale CSV proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-STALE-CSV-PROOF-codex-2026-07-14`

Scope: PII-safe stale proof / dry-run only. No `--commit`, no database writes, no production env, no `/opt`, no R2.

Run timestamp: `2026-07-14T02:49:53+03:00`.

## Environment

| Field          | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Worktree       | `/home/dev/dev-projects/bcb-walls`                                                                        |
| Branch         | `auto/code-pg-delta`                                                                                      |
| Run HEAD       | `90da725f55d938b29eb9d3bb846277689d29b384`                                                                |
| Database       | `bcb_webapp_dev` on `127.0.0.1:5432`                                                                      |
| Env source     | `/home/dev/dev-projects/BersonCareBot/.env` + `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` |
| Telegram token | process-local non-secret placeholder, only for config parsing                                             |

## CSV shape

| Check                            |                  Result |
| -------------------------------- | ----------------------: |
| File exists                      |                     yes |
| Basename                         |         `records-2.csv` |
| Size                             |            127600 bytes |
| Physical lines                   |                     394 |
| Header present                   |                     yes |
| Header delimiter                 |               semicolon |
| Header fields                    |                      22 |
| Parsed Rubitime ids              |                     392 |
| CSV date span reported by script | 2026-01-16...2026-08-29 |

The shape check did not print row content, names, phones, or external ids.

## Exact command shapes

CSV shape, aggregate-only:

```bash
test -f /home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
wc -l /home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
head -n 1 /home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv | awk '{print "header_bytes=" length($0); print "semicolon_count=" gsub(/;/,"&"); print "comma_count=" gsub(/,/,"&"); print "tab_count=" gsub(/\t/,"&")}'
```

Backfill stale dry-run, no commit:

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

Read-only dual-source audit:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 \
  --sample-size=0
```

## Backfill dry-run aggregate result

| Check                                           | Count |
| ----------------------------------------------- | ----: |
| Legacy live rows                                |   364 |
| Canonical `rubitime_projection` live rows       |   241 |
| Unmapped legacy total                           |   112 |
| Unmapped test/block                             |     0 |
| Unmapped canceled                               |    13 |
| Unmapped real active                            |    99 |
| Unmapped future                                 |     0 |
| Duplicate clusters                              |     3 |
| Duplicate clusters with multiple canonical rows |     0 |
| Stale vs owner CSV                              |    29 |

Interpretation: the owner CSV completed the previously missing stale-vs-CSV dry-run proof. The dry-run reports 29 live legacy records absent from the CSV within the CSV date range. No stale rows were soft-deleted because `--commit`, `--drop-stale-from-csv`, and `--drop-legacy` were not used.

## Post-dry-run dual-source audit

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

## Remaining blockers

- `RR-PROOF-01-DUAL-SOURCE` remains blocked.
- The 29 stale-vs-CSV rows need owner/reviewer classification and explicit approval before any cleanup commit.
- `UNMAPPED real active` remains 99.
- `DUPLICATE clusters` remains 3; broad duplicate collapse was not authorized.
- Legacy-only records, status mismatches, record-time mismatches, and mapping anomalies still need owner/reviewer classification or explicit exceptions.
- Doctor calendar/list/KPI smoke is still not recorded.

## Explicit no-go until owner approval

- Do not start R2.
- Do not drop Rubitime runtime/schema.
- Do not run stale cleanup with `--commit`, `--drop-stale-from-csv`, or `--drop-legacy`.
- Do not treat the 29 stale-vs-CSV rows as removable without owner/reviewer classification.

## Post non-confirmed cleanup rerun

Run id: `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14`

After the separate owner-approved non-confirmed status cleanup, the same owner CSV proof command was rerun with `records-2.csv` in summary-only dry-run mode. No `--commit`, `--drop-stale-from-csv`, `--drop-legacy`, production env, `/opt`, or R2 work was used.

| Check                                           | Count |
| ----------------------------------------------- | ----: |
| Legacy live rows                                |   317 |
| Canonical `rubitime_projection` live rows       |   207 |
| Unmapped legacy total                           |    99 |
| Unmapped cancelled                              |     0 |
| Unmapped real active                            |    99 |
| Duplicate clusters                              |     3 |
| Duplicate clusters with multiple canonical rows |     0 |
| Stale vs owner CSV                              |    28 |
| Non-confirmed cleanup candidates                |     0 |

The previous stale count dropped from 29 to 28 because one stale-vs-CSV row was also in the now-approved non-confirmed cleanup category. The remaining 28 stale-vs-CSV rows still require owner/reviewer classification before any broad stale cleanup.
