# B0 salvage deletion classification — 20.08.2026

Mission: restore the fresh-dump `A → B0` machinery that `609a19f94` ("salvage: establish B0-forward
candidate without replay", 17.08) removed alongside the historical/A0/A1 chain the owner's B0 decision
does authorize removing (`docs/OWNER_DECISIONS.md` §«B0 вместо исторической цепочки миграций», 16.08).
This table classifies every path `609a19f94` deleted; commands used are given so the counts are
reproducible, not typed from memory (per the box-wide "number without a command is not a number" rule).

## Commands

```bash
git show 609a19f94 --diff-filter=D --name-only --pretty=format: | sed '/^$/d' > deleted-files.txt   # 667 paths
git show 609a19f94 --numstat > numstat.txt                                                          # per-path +/-
git show 609a19f94 --shortstat                                                                       # 797 files changed, 8780 insertions(+), 455344 deletions(-)
```

`609a19f94` touched 797 files total (deletes + modifies + adds); 667 of those were wholesale deletions,
totalling 413,593 removed lines from fully-deleted files (the remaining ~41,751 deleted lines are partial
deletions inside the 104 files it modified, mostly `AGENTS.md`, `.github/workflows/ci.yml`, and the
declarative privilege artifacts it regenerated). The mission brief's "668 files" is a close paraphrase of
this 667/797 pair, not a distinct count — noted here rather than silently used as if measured twice.

## Classification of the 667 deleted paths

| category | files | lines | verdict | why |
|---|---:|---:|---|---|
| `apps/webapp/db/drizzle-migrations/*.sql` (historical, `NNNN_...`) | 445 | 48,022 | **AUTHORIZED** | the historical migration chain the B0 decision names for removal by number |
| `apps/webapp/migrations/*` (pre-Drizzle legacy SQL) | 91 | 2,267 | **AUTHORIZED** | same historical chain, older layer |
| `apps/integrator/src/infra/db/migrations/core/*.sql` | 61 | 3,187 | **AUTHORIZED** | integrator's own historical migration chain |
| `apps/webapp/db/drizzle-migrations/meta/*` (old journal/snapshots) | 23 | 321,262† | **AUTHORIZED** | pre-B0 journal/snapshot history; today's tree carries a fresh `_journal.json`/`_journal.frozen`/`0001-0003_snapshot.json` re-baselined on B0 |
| `apps/integrator/src/integrations/telegram/db/migrations/*.sql` | 14 | 620 | **AUTHORIZED** | integrator subsystem historical chain |
| `apps/integrator/src/integrations/rubitime/db/migrations/*.sql` | 8 | 214 | **AUTHORIZED** | integrator subsystem historical chain |
| `docs/ARCHITECTURE/DB_DUMPS/{a0-greenfield,a1-rls}/*`, `scripts/{a0-greenfield,verify-a0,verify-a1,check-a0,refresh-a0}*`, `apps/webapp/scripts/run-a1-rls-conformance.ts` | 15 | 32,604 | **AUTHORIZED** | the A0/A1/greenfield/disposable-bootstrap family the decision names explicitly |
| `deploy/host/migrate.sh`, `scripts/migrate-all.sh`, `apps/webapp/scripts/run-migrations.mjs` | 3 | 342 | **AUTHORIZED** | legacy sequential-replay runners (`run-migrations.mjs` self-labels `LEGACY`); superseded by `deploy/postgres/privileges/migrate-local.mjs` (filename-order, tag ledger) |
| `scripts/deploy-saas-667.sh` | 1 | 560 | **AUTHORIZED** | "disposable/prod-copy #667 migration chain model" per `HARD_MIGRATION_PROTOCOL.md`'s own canonical-sources list — disposable bootstrap family |
| `deploy/host/saas-test-mode.sh` | 1 | 344 | **OUT OF SCOPE for this mission** | TEST dormant/locked runtime-mode switch helper; orthogonal to the fresh-dump/cutover path this mission covers. Still referenced as canonical by `HARD_MIGRATION_PROTOCOL.md`'s source list — worth a separate owner question, not restored here |
| `deploy/host/restore-test-db-from-dump.sh`, `deploy/host/deploy-test-full-reset.sh`, `deploy/host/deploy-test-full-reset.test.mjs`, `scripts/refresh-prod-to-target-cutover.mjs` | 4 | 340 | **REMOVED IN ERROR → RESTORED this pass** | the B0 decision's own required fresh-dump `A → B0` rehearsal machinery; see restoration notes below |
| `deploy/host/deploy-test-saas.sh` | 1 | 3,770 | **REMOVED IN ERROR → NOT restored this pass** | the only caller `deploy-test-full-reset.sh` execs; without it the restored wrapper fails loudly by name (guard added) but cannot run. Not restored verbatim: it predates the move of migration ACL/grants to the declaration-reconcile path (`609a19f94`'s own message), so a straight restore would very likely reintroduce forbidden inline GRANT/REVOKE. Needs its own dedicated pass, not a mechanical restore |

† `drizzle-migrations/meta` deletion count is inflated by the historical `_journal.json`, whose diff is dominated by JSON reformatting of ~450 historical entries, not 321k lines of distinct content.

**Sum check:** 445+91+61+23+14+8+15+3+1+1+4+1 = 667. ✅ all 667 deleted paths accounted for, none uncategorized.

## Two files restored here were not actually deleted by `609a19f94`

`scripts/prod-to-target-baseline-policy.mjs` and `deploy/postgres/prod-to-target-cutover.sql` — 2 of
the 6 files this pass restores — are **not** in `609a19f94`'s own deleted-file list above; they were
deleted by the very next commit, `bfe6b48f0` ("fix(salvage): remove alternate B0 paths and repair
patient writes", also 17.08, same salvage effort). Restoring them from `609a19f94^` per the mission
brief is still correct (both commits are the same salvage day, same decision to remove "alternate B0
paths"), but the attribution needs to be exact: **4 of the mission's 6 files were deleted by `609a19f94`
itself; 2 were deleted by `bfe6b48f0` one commit later.**

## `bfe6b48f0` deleted the rest of the fresh-dump machinery — not this mission's named scope, flagged here

`git show bfe6b48f0 --diff-filter=D --name-only` lists 29 deleted paths. Of those, 16 are squarely the
same required B0 fresh-dump machinery, **not restored by this pass** (out of the mission's named 7-file
list) and needed for `prod-to-target-cutover.sql` to actually run:

- `deploy/postgres/prod-to-target-cutover-start.sql` (329 lines), `-data.sql` (530), `-finish.sql` (85),
  `-known-missing-media.sql`, `-patient-membership-manifest.sql` — the `\ir`-included siblings
  `prod-to-target-cutover.sql` sequences.
- `deploy/postgres/pre-cutover-data-stage-assertions.sql`.
- `deploy/postgres/generated/prod-to-target/{schema-pre,schema-post,ledgers-and-baseline,runtime-settings}.sql`
  (31,905 + 20,908 + 612 + 121 lines) — the artifacts `refresh-prod-to-target-cutover.mjs` produces from
  `bcb_webapp_dev`; not regenerated in this pass (would require running `pnpm run
  refresh:prod-to-target-cutover`, out of scope for a restoration pass — see Definition of Done notes).
- `scripts/prod-to-target-baseline-policy.test.mjs`, `scripts/prod-to-target-cutover-executable-gate.mjs`,
  `scripts/prod-to-target-cutover-contract.test.mjs` — the stricter check `check:prod-to-target-cutover`
  used to run (the historical `package.json` chained `refresh-prod-to-target-cutover.mjs --check &&
  prod-to-target-cutover-executable-gate.mjs`); this pass registers `check:prod-to-target-cutover` as
  only the first half, which is weaker than the original gate — flagged, not silently claimed equivalent.

The other 13 `bfe6b48f0` deletions (D30 disposable-concurrency check scripts, disposable-proof `.mjs`
fixtures, stray `runs/**` evidence artifacts) read as authorized disposable/runtime-evidence cleanup on
a first pass, consistent with the same commit's own "repair patient writes" framing — not independently
verified line-by-line here, since `bfe6b48f0` is outside this mission's named authority (`609a19f94`).

## Restoration notes for the 6 files (details in each file's own diff / commit message)

- `restore-test-db-from-dump.sh`: `OWNER_ROLE=bersoncarebot_test` role no longer exists (live check:
  `pg_roles` has no such role); the DB owner is `postgres` and ordinary restored objects belong to the
  cluster-wide `app_object_owner` (both confirmed live). Manual `CREATE ROLE`/`ALTER ROLE` block removed
  (would violate this mission's "do not create roles" constraint and duplicate the declarative
  shared-role-baseline chokepoint) and replaced with an assertion. `integrator.identities` no longer
  exists (live check: 0 rows in `information_schema.tables`); sanity check retargeted at
  `integrator.schema_migrations`, which does exist and plays the same "did the integrator schema
  restore" role.
- `deploy-test-full-reset.sh`: added a named existence guard for `deploy-test-saas.sh` so a checkout
  missing it fails with a clear message instead of a bare `exec` error; registered the
  `check:prod-to-target-cutover` pnpm script it calls (see gap above).
- `deploy-test-full-reset.test.mjs`: fixture now stands up a stub `deploy-test-saas.sh` so the guard
  passes, plus one new test for the guard itself.
- `refresh-prod-to-target-cutover.mjs`: the DEV-ledger staleness check compared `meta/_journal.json`'s
  last `when` against the DB's `max(created_at)`; `_journal.json` is now frozen (AGENTS.md "Миграции
  после baseline B0") and never gains new entries for post-B0 (`YYYYMMDDTHHMMSS_...`-named) migrations,
  so the old check would go permanently stale after the first post-B0 migration. Replaced with the same
  filename-order/tag-ledger pending check `migration-order.mjs` gives every other runner. Added
  `mkdirSync` for the output directory, which no longer exists in the tree.
- `prod-to-target-baseline-policy.mjs`: verified column-position assumptions against live
  `bcb_webapp_dev` (`saas_tariffs` 18 columns, `saas_paid_period_policy` 7, `saas_registration_tariff_policy`
  5, `saas_trial_policy` 10, `app_runtime_settings` 7 — all match exactly) and the four reviewed tariff
  IDs/prices/seats/periods against live data — no drift found, restored unchanged.
- `prod-to-target-cutover.sql`: pure `\ir` sequencer, no role/db-specific content — restored unchanged.
