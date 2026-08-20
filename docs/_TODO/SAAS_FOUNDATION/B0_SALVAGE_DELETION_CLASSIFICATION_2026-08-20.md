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

**UPDATE 2026-08-20 (second pass, `restore-ab2-20260820`): `deploy-test-saas.sh` restored, minus the confirmed
grant-model duplicates.** Read from `609a19f94^`, diffed against today's tree function-by-function. Three
pieces (191 of 3,770 lines) were dropped, each with a named, verified replacement already live in today's
tree — none left without a replacement, so nothing was silently re-granted:
1. `grant_migrator_app_owner_membership`/`revoke_migrator_app_owner_membership` (temporary `app_owner`
   membership so a migration running AS `$DBROLE` could `ALTER FUNCTION ... OWNER TO app_owner`) — dead code,
   zero call sites even in the original file; a vestige of the historical `pnpm migrate`-as-`$DBROLE` replay
   this file's own B0 cutover step no longer does (it runs as `postgres` superuser, which needs no membership
   to reassign ownership). For ordinary deploys the same need is met today by
   `deploy/postgres/privileges/migrate-local.mjs`'s own self-contained temporary owner-membership grant/revoke
   inside its single migration transaction (`migrate-local.mjs:301,371`).
2. The inline pgcrypto-schema-move + `is_staff`/`current_*()` ownership pre-normalization heredoc inside
   `install_p2_b_protected_principal_context()` — `deploy/postgres/p2-b-protected-principal-context.sql`
   (unchanged, already in the tree, called immediately after this block) now does the same pgcrypto move itself
   (lines 92-139) and a `DROP`+`SET ROLE`+`CREATE` pattern that needs no pre-existing ownership; `app_owner`
   itself is created by the declarative shared-role-baseline, not by this wrapper.
3. `grant_api_runtime_migration_ledger_read`/`assert_api_runtime_can_read_migration_ledger` (raw
   `GRANT USAGE ON SCHEMA integrator` + `GRANT SELECT ON TABLE integrator.schema_migrations`) — replaced by the
   declared `SECURITY DEFINER` seam `app.read_integrator_migration_ledger()`
   (`deploy/postgres/privileges/declaration.ts:2309-2311,4256-4261`), which the reconcile/generator already
   installs and grants `EXECUTE` on — no raw relation ACL needed.

The remaining `GRANT`/`REVOKE`/`ALTER ROLE` calls in the restored file (`revoke_bypass`,
`grant_migrator_owner_membership`/`revoke_migrator_membership`, the two `ALTER ROLE ... BYPASSRLS` call sites)
were kept: they are ephemeral, self-reverting elevation for one-shot data scripts
(`fio:owner-reviewed-test:apply`, `cutover:legacy-appointments`) to write across RLS during the reset window,
asserted clean afterward (`assert_cleanup_elevation`) — the same shape `migrate-local.mjs` itself uses, not a
duplicate of the permanent runtime-role ACL model.

`p0-data-fix-doctor-admin-split.sql` now has its call back: `deploy-test-saas.sh:3465`
(`run_test_db_owner_sql_file "$DEPLOY_REPO/$DATAFIX"`), positioned after the dump restore (`:3455`) and owner-
identity consolidation (`:3461`), before `install_pre_migration_role_prerequisites` (`:3504`) and the schema
cutover — this was already the original script's own ordering, restored as-is.

**New findings surfaced by this pass, not fixed (named, not silently patched):**
- Today's `deploy/host/deploy-test.sh` no longer calls `deploy-test-saas.sh` at all (confirmed by a full read of
  all 229 lines) — it runs its own self-contained `migrate-local.mjs` + `migrate-integrator-local.mjs` +
  `reconcile-access.mjs` pipeline instead. `deploy-test-saas.sh`'s giant `run_strict_post_migration_closure()`
  (~1,200 lines: P0.5b, P2-B, D3.4, telemetry overlays, RLS finalizer, C4 operational runtime, port-context
  roles/catalog, and every `assert_*_closure` gate including `assert_app_owner_secdef_table_grants_complete`)
  is reachable ONLY via the `--post-migration-closure` CLI flag, which nothing in today's tree passes —
  confirmed dead relative to both live entrypoints (ordinary `deploy-test.sh` and the full-reset default flow,
  which ends at `run_port_context_test_release` and never calls the closure). So the mission's premise question
  ("does `deploy-test.sh` carry the same exact-grant-set assertion `deploy-test-saas.sh` had") resolves to: no —
  `deploy-test.sh` has no per-function/per-table closure gates of its own; it relies on `reconcile-access.mjs`'s
  coarser, DB/catalog-wide `--check`/`--port-context-verify`/`--env-verify`/`--catalog-closure-verify` chain,
  which is a different (and automatic-on-every-deploy) mechanism, not the same assertions relocated.
- The full-reset flow's own final step, `run_port_context_test_release()`, calls
  `deploy/host/cutover-postgres-port-context.sh`, which does not exist in today's tree — deleted by `9ebea6963`
  ("fix: complete patient B0 capability boundary"), an unrelated later commit, not by the `609a19f94` salvage
  this mission addresses. Today's `deploy-test.sh` requires `DB_PRINCIPAL_CONTEXT_MODE=port-context`
  unconditionally (no legacy mode left to cut over from) and calls no cutover script at all — only
  `bootstrap-c4-test-env.mjs --port-context-execute`. This suggests the whole "cut over TO port-context" step is
  itself now obsolete, but redesigning it is out of this mission's scope ("вернуть ФАЙЛЫ", not rewrite the
  sequence) — named here as a blocker for anyone who tries to actually run a full reset next.
- Also missing (confirmed live-checked, not part of the `609a19f94`/`bfe6b48f0` salvage): `deploy/host/smoke-set-postgres-role-password.sh`, `deploy/host/retire-media-db-login.test.mjs`,
  `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs` — all three retired by
  `fb44002ce` ("fix(db): retire disposable database execution surfaces").
- `saas-test-mode.sh` was NOT restored (still out of scope, unchanged from the first pass's call). Question for
  the owner: it was a TEST-only `DB_PRINCIPAL_CONTEXT_MODE` switch/rollback helper (dormant↔locked), explicitly
  self-described as historical/diagnostic and forbidden from being used to recover a failed strict TEST deploy.
  `HARD_MIGRATION_PROTOCOL.md` still names it canonical. Nothing in today's runnable code calls it (docs-only
  references). Since `deploy-test.sh` now hard-requires `port-context` mode unconditionally, this switch-to-
  `dormant`/`locked` helper looks similarly obsolete to the port-context cutover script above — but that is a
  guess, not verified, and is the owner's call, not mine, to retire outright or restore.

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
