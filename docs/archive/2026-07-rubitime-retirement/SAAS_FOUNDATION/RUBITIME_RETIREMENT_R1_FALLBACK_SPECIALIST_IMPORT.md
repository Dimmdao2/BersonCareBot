# Rubitime retirement R1 fallback specialist import

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-FALLBACK-SPECIALIST-IMPORT-codex-2026-07-14`

Scope: owner-approved dev DB import for pre-webapp Rubitime history rows that lack specialist/branch/service refs in the legacy payload. Aggregate-only, no row list, no PII, no production DB, no `/opt` env, no R2.

## Owner decision

Owner confirmed that the remaining old-period active rows belong to one webapp doctor. The owner-provided doctor phone was used only as a resolver input and is intentionally not written here.

Read-only preflight found:

| Check                                               | Count |
| --------------------------------------------------- | ----: |
| matched platform users by phone tail                |     1 |
| matched organizations                               |     1 |
| active specialists in organization                  |     2 |
| dominant specialist live `rubitime_projection` rows |   171 |
| other specialist live `rubitime_projection` rows    |    36 |
| legacy branch groups among target rows              |     2 |
| legacy branch groups with city/branch mapping       |     2 |

Interpretation: the old legacy rows did not carry full Rubitime specialist refs because they predate the webapp/canonical setup. The import therefore used the owner-confirmed organization and the dominant existing Rubitime-history specialist, while branch/city was restored through the existing Rubitime branch to webapp city/branch mapping.

## Exact commands

Dry-run:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --historical-owner-doctor-phone=<owner-provided-phone> \
  --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Commit:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit \
  --historical-owner-doctor-phone=<owner-provided-phone> \
  --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

Follow-up strict canceled cleanup:

```bash
TELEGRAM_BOT_TOKEN=dev-placeholder-not-real \
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit \
  --cleanup-only \
  --delete-non-confirmed \
  --summary-only \
  --csv=/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv
```

## Before and after

| Check                                     | Before import | After import | After canceled cleanup |
| ----------------------------------------- | ------------: | -----------: | ---------------------: |
| Legacy live rows                          |           317 |          317 |                    299 |
| Canonical `rubitime_projection` live rows |           207 |          305 |                    287 |
| Unmapped legacy total                     |            99 |            1 |                      1 |
| Unmapped real active                      |            99 |            1 |                      1 |
| Historical fallback import candidates     |            98 |            0 |                      0 |
| Non-confirmed cleanup candidates          |            18 |           18 |                      0 |
| Stale vs owner CSV                        |            28 |           28 |                     10 |
| Duplicate clusters                        |             3 |            3 |                      3 |

Commit effects:

| Action                                                                        | Count |
| ----------------------------------------------------------------------------- | ----: |
| Canonical `rubitime_projection` rows inserted                                 |    98 |
| Legacy canceled rows soft-deleted after strict cleanup                        |    18 |
| Mapped canonical `rubitime_projection` rows soft-deleted after strict cleanup |    18 |

## Current remaining blockers

- `UNMAPPED real active` is now `1`, and that row is stale-vs-owner-CSV.
- Stale-vs-owner-CSV remains `10`, all active non-test rows.
- Duplicate clusters remain `3`; all overlap stale rows.
- Dual-source audit still reports `legacy-only=312`, `status_mismatches=4`, and `record_at_mismatches=2`.
- Doctor calendar/list/KPI smoke is still not recorded.

## Explicit no-go

- No production DB was touched.
- No `/opt/env` files were read.
- No stale cleanup was run for active stale rows.
- No broad duplicate collapse was run.
- No R2 work was started.
