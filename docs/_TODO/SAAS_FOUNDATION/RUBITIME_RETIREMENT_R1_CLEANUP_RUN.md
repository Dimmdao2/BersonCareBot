# Rubitime retirement R1 cleanup run

Run id: `R1-CLEANUP-codex-2026-07-14`

Scope: R1 cleanup only after owner approval for test/block rows and canceled duplicate losers. No R2 work was started. All outputs below are aggregate-only and PII-safe.

## Environment

| Field | Value |
| --- | --- |
| Worktree | `/home/dev/dev-projects/bcb-walls` |
| Branch | `auto/code-pg-delta` |
| Database | `bcb_webapp_dev` on loopback |
| Env source | local dev env only |
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

## Cleanup behavior

- `--delete-test` soft-deleted owner-approved test/block legacy rows and their mapped canonical rows.
- `--collapse-canceled-dups` soft-deleted only canceled duplicate loser rows.
- For all-canceled duplicate clusters, the script keeps one representative and soft-deletes the rest.
- Non-canceled duplicate rows are never soft-deleted by `--collapse-canceled-dups`.
- `--cleanup-only` skipped tolerant projection and did not require the Rubitime bridge to be enabled.

## Before and after

| Check | Before | After |
| --- | ---: | ---: |
| Legacy live rows | 400 | 364 |
| Canonical `rubitime_projection` live rows | 258 | 241 |
| Unmapped legacy total | 126 | 112 |
| Unmapped test/block | 13 | 0 |
| Unmapped canceled | 20 | 13 |
| Unmapped real active | 99 | 99 |
| Unmapped future | 0 | 0 |
| Duplicate clusters | 7 | 3 |
| Duplicate clusters with multiple canonical rows | 0 | 0 |
| Stale vs CSV | skipped | skipped |

Commit effects:

| Action | Count |
| --- | ---: |
| Test/block legacy rows soft-deleted | 34 |
| Mapped canonical rows soft-deleted by test/block cleanup | 21 |
| Duplicate clusters with canceled losers touched | 2 |
| Canceled duplicate loser rows soft-deleted | 2 |

## Post-cleanup dual-source audit

| Check | Count |
| --- | ---: |
| raw-only records | 0 |
| legacy-only records | 312 |
| status mismatches | 4 |
| `record_at` mismatches over 5 minutes | 2 |
| raw mapping coverage | 91 of 91 |
| legacy mapping coverage | 274 of 403 |
| legacy unmapped | 129 |
| legacy mappings to soft-deleted canonical appointments | 21 |
| unexpected canonical source | 6 |
| missing expected mapping metadata | 6 |

Interpretation: the approved cleanup removed the explicitly allowed test/block rows and narrowed duplicate clusters. It does not make `RR-PROOF-01-DUAL-SOURCE` pass.

## Remaining blockers before R2

- `UNMAPPED real active` remains 99.
- `DUPLICATE clusters` remains 3; broad duplicate collapse was not authorized and was not run.
- Stale-vs-CSV proof remains unavailable because no approved current CSV was provided.
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

node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 --sample-size=0
```

Not used: `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`.

Environment: `/home/dev/dev-projects/bcb-walls` on `auto/code-pg-delta`, dev DB `bcb_webapp_dev` on loopback, local dev env only, process-local non-secret Telegram placeholder for webapp config parsing.

### Second-pass before and after

| Check | Before | After |
| --- | ---: | ---: |
| Legacy live rows | 364 | 364 |
| Canonical `rubitime_projection` live rows | 241 | 241 |
| Unmapped legacy total | 112 | 112 |
| Unmapped test/block | 0 | 0 |
| Unmapped canceled | 13 | 13 |
| Unmapped real active | 99 | 99 |
| Unmapped future | 0 | 0 |
| Duplicate clusters | 3 | 3 |
| Duplicate clusters with multiple canonical rows | 0 | 0 |
| Stale vs CSV | skipped | skipped |

Second-pass commit effects:

| Action | Count |
| --- | ---: |
| Test/block legacy rows soft-deleted | 0 |
| Mapped canonical rows soft-deleted by test/block cleanup | 0 |
| Duplicate clusters with canceled losers touched | 0 |
| Canceled duplicate loser rows soft-deleted | 0 |

Interpretation: the expanded approved categories were idempotent against the current dev snapshot. No additional rows were soft-deleted.

### Second-pass dual-source audit

| Check | Count |
| --- | ---: |
| raw-only records | 0 |
| legacy-only records | 312 |
| status mismatches | 4 |
| `record_at` mismatches over 5 minutes | 2 |
| raw mapping coverage | 91 of 91 |
| legacy mapping coverage | 274 of 403 |
| legacy unmapped | 129 |
| raw mappings to soft-deleted canonical appointments | 4 |
| legacy mappings to soft-deleted canonical appointments | 21 |
| unexpected canonical source | 6 |
| missing expected mapping metadata | 6 |

Residual blockers are unchanged from the first cleanup pass; R1 remains blocked and R2 remains forbidden.
