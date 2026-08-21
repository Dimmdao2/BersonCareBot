# TEST reference baseline forward + fixture prerequisite — independent audit

- Candidate: `43cb0b7465776d4c1f4613ffce6f9bf559d8b43a`
- Base synced from `feat/doctor-ui-rebuild`: `2435c795f096423ffa5a3187a80c629d7c791c95`
- Role: independent first auditor of the new baseline migration/prerequisite surface
- Scope: one audit gate; no product fix, DB write, fixture/deploy, full CI, push, disposable DB, historical replay or PROD action

## Blind kill-set — written before reading candidate tests

Oracle: `docs/_TODO/TEST_FIXTURE_HAS_NO_DOOR_2026-08-19.md` continuation §1 and the 2026-08-21 owner/lead row in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`: an empty `public.reference_catalog_baselines` makes every organization insert fail with SQLSTATE `P0002`; active B0-forward must restore reviewed global versions 1/2, and the existing protected TEST fixture door must reconcile the same prerequisite before Clinic A/B without applying or recording a migration.

### K1 — active forward migration/data semantics (one-off: inspect)

1. Omitting version 1 or 2, changing a reviewed definition, or using a non-idempotent insert leaves new-clinic registration broken or creates divergent global catalog state.
2. Replacing/deleting existing rows or introducing tenant/credential data corrupts the global baseline rather than repairing the missing prerequisite.
3. A non-UTC/non-timestamp filename, missing `BCB-MIGRATION-BACKFILL`, weak/missing verify probe, journal edit, historical-file restoration, or rights/role/owner/policy/RLS statement bypasses the active migration contract.
4. Migration definitions and fixture prerequisite definitions drifting apart make deploy and pre-deploy fixture runs create different clinic snapshots.

Method: exact base..candidate diff, parser/order/proof gates, exact comparison with historical reviewed `0034`, and catalog/hash/count inspection only. No source-string test for one-off SQL.

### K2 — prerequisite ordering and conflict policy (repeatable wrapper behavior)

1. Omitting the reconcile or running it after the seeder recreates the observed `P0002` before Clinic A/B.
2. An already-correct versions 1/2 baseline must remain byte/semantically unchanged.
3. A conflicting existing version/definition must fail closed; silent overwrite would corrupt canonical global state.
4. Corrupt, incomplete, dirty, untracked, symlinked or unreviewed canonical input must fail before temporary authority or database mutation.

Expected fault injection: omit/reorder reconcile; corrupt/unreviewed input. The existing acceptance harness must turn red for each independent class.

### K3 — authority, ledger, tenant wall, source and secret boundary (inspect + repeatable tests)

1. The prerequisite must not execute or record a migration, mutate `drizzle.__drizzle_migrations`, or bypass/reorder/relax tenant-wall.
2. It must reuse the accepted temporary-role/protected-env/clean-reviewed-checkout boundary and must not create permanent authority.
3. It must not source broad TEST env, trust an unreviewed TEST execution path, or expose URL/password/packet definitions in argv, inherited env or output.
4. Root `--recover` must remain independent of TEST runtime, canonical baseline input, seeder, dependencies and local toolchain.

Expected fault injection: URL/secret argv or inherited env; dirty/untracked/symlinked source; broken TEST runtime during recovery.

### K4 — bounded failure cleanup and service restoration (repeatable wrapper behavior)

1. Baseline reconcile, seeder and every PostgreSQL child must be time-bounded; a hang must not hold TEST services or temporary authority indefinitely.
2. Failure before, during or after the prerequisite must drop temporary role/credential/state residue and restore exactly the recorded five TEST services.
3. A prerequisite command failure must propagate non-zero while still converging cleanup/recovery.
4. The accepted direct TEST-local `tsx` path must remain free of pnpm/Corepack regressions.

Expected fault injection: prerequisite command failure; cleanup/recovery failure; local tool invocation regression.

### K5 — operator/documentation path (one-off: inspect)

1. Current docs must not claim TEST baseline rows exist when the measured exact count is zero.
2. There must remain one canonical operator path: fixture prerequisite, then ordinary `deploy-test.sh`; no second deploy/migration/manual-ledger path.

## Candidate inspection

Full diff inspected:

```text
git diff --find-renames --find-copies --binary 2435c795f096423ffa5a3187a80c629d7c791c95..43cb0b7465776d4c1f4613ffce6f9bf559d8b43a
7 files changed, 97 insertions(+), 11 deletions(-)
```

- The active migration is the valid UTC timestamp name `20260821T025935_restore_reference_catalog_baselines.sql`, has one `BCB-MIGRATION-BACKFILL` statement, has a leading verify probe, and adds no ACL/role/owner/policy/RLS statement.
- `git diff --exit-code <base>..<candidate> -- apps/webapp/db/drizzle-migrations/meta/_journal.json` returned `0`; no journal edit or historical migration restoration exists. `find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' ... | wc -l` returned `19`, all timestamp-forward names.
- The unchanged seeder was proved by `git diff --exit-code <base>..<candidate> -- apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts` → `0`.
- Historical reviewed `0034`, the new forward migration DML, and `deploy/postgres/reference-catalog-baselines.sql` are byte-identical from the first baseline `INSERT`: all three SHA-256 values are `918bdc32cc475799d756e40e889e53d50a1ef1f34b22239ecc03f5a219a5644c`.
- Parser inspection of the two JSON values returned version 1 = 8 categories, SHA-256 `060b95f9ffa683c3768d147af668ee955b4d66b651df5c612e7bd99c6c737ba5`; version 2 = 9 categories, SHA-256 `ec8bdd91aa5ca9ba8d124ceeff6737331a77123fa4fc759ed51d9a9e76e10757`. No tenant identifier, credential or packet data is present.
- The wrapper stages only the clean/tracked/non-symlink reviewed asset, compares its entire DML byte-for-byte with the forward migration, runs it before the unchanged seeder through the existing temporary role/protected env, and does not touch the migration ledger or tenant-wall sequence.
- Documentation now records TEST count `0`, DEV count `2`, the `P0002` failure, the active forward repair and exactly one operator sequence: prerequisite, then ordinary `deploy-test.sh`.

## Findings

### F1 — MUST FIX: conflicting baseline definitions are silently accepted

Reachable scenario: TEST or another B0 database already has version 1 or 2 with a definition different from the reviewed canonical JSON. Both canonical inserts use `ON CONFLICT (version) DO NOTHING`; the fixture has no post-reconcile equality assertion. The migration verify probe checks only version presence and category counts (8/9), so a divergent definition with the same category count also passes migration proof.

Impact: the fixture continues into Clinic A/B and ordinary new-clinic registration can copy a noncanonical global reference snapshot; the forward migration can be recorded as applied while the repaired state still diverges from the reviewed baseline.

Violated requirement: K1 exact reviewed versions without divergence, and K2 “does not silently overwrite a conflicting version/definition and fails closed”. This is data correctness, not style.

### F2 — MUST FIX: fixture baseline reconciliation is not atomic

Reachable scenario: the protected `psql -f` succeeds on the version-1 insert and fails or loses its connection before the version-2 insert. The asset contains two ordinary statements and the wrapper invokes `psql -X -v ON_ERROR_STOP=1 -f` without `-1`/`--single-transaction` or an explicit transaction.

Impact: version 1 remains committed, EXIT restores the five recorded services, and live new-clinic registration resumes against an incomplete baseline (latest version 1, missing the reviewed version-2 category) until a later repair.

Violated requirement: K2 requires the empty baseline to be reconciled before the first organization and to fail closed on incomplete canonical input/state; K4 requires failure convergence without prerequisite residue. The migration runner itself is transactional; this finding is limited to the temporary fixture prerequisite.

### F3 — MUST FIX: root recovery depends on the baseline input it must recover independently from

Reachable scenario: a failed run preserves protected state/temporary role, then the baseline asset or its migration is missing/divergent while being repaired. `--recover` calls `require_reviewed_source --recover` before lock/state cleanup, and that function requires both baseline files and their DML equality.

Executable evidence added by this audit:

```text
node --test deploy/host/reconcile-saas-test-walkthrough-fixtures.test.mjs
root --recover ignores broken baseline input and restores recorded units
FAIL: FATAL: canonical path guard failed: deploy/postgres/reference-catalog-baselines.sql
```

Impact: the documented emergency command can leave a collision-safe but still SUPERUSER temporary role and protected recovery state present solely because unrelated baseline input is broken; operator cleanup cannot converge through the canonical door.

Violated requirement: K4 says root `--recover` remains independent of TEST runtime/baseline input.

## Fault injection ledger

All mutations below were applied one at a time to the production wrapper, the named focused test was run, and the mutation was restored before the next one.

| Independent class            | Injected fault                                                                         | Red assertion                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Omit/reorder prerequisite    | Wrapped the baseline `pg_run` in `if false`                                            | `baseline reconciliation must run`                                                         |
| Corrupt/unreviewed input     | Replaced the migration↔asset DML comparison with unconditional success                 | `divergent`: expected non-zero, actual `0`                                                 |
| Prerequisite command failure | Replaced the checked call with cleanup-style execution and ignored its non-zero result | expected wrapper non-zero, actual `0`                                                      |
| URL/secret or inherited env  | Removed `env -i` from the temporary-authority seeder child                             | expected empty sentinel, observed `tsx_inherited_fixture_sentinel=must-not-cross-boundary` |
| Cleanup/recovery regression  | Skipped `cleanup_role`                                                                 | expected `baseline_failed ... dropped`, no `dropped` call observed                         |

The baseline failure dependency itself (`FAIL_BASELINE=1`) passes on the unmodified candidate: seeder is skipped, the role is dropped, all five recorded services are started, the three temporary files are absent, and no URL/packet content appears in output. The new unmodified-candidate recovery scenario is intentionally red as F3.

Restoration evidence:

```text
git diff --exit-code HEAD -- deploy/host/reconcile-saas-test-walkthrough-fixtures.sh
# exit 0
rg -n 'AUDIT FAULT' deploy/host/reconcile-saas-test-walkthrough-fixtures.sh deploy/host/reconcile-saas-test-walkthrough-fixtures.test.mjs
# no matches
```

## Kill-class verdicts

| Class                                             | Result         | Evidence                                                                                                                                                     |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1 active forward migration/data                  | **NOT CAUGHT** | Exact historical DML restored and static contracts pass, but F1 allows divergent definitions and the verify probe can accept them.                           |
| K2 prerequisite ordering/conflict policy          | **NOT CAUGHT** | Empty/correct ordering and corrupt reviewed input are protected; F1 silently accepts DB conflicts and F2 can leave only version 1 committed.                 |
| K3 authority/ledger/tenant/source/secret boundary | **KILLED**     | No ledger/tenant-wall path added; clean reviewed source, protected files, argv/output secrecy and inherited-env mutation all held.                           |
| K4 bounds/cleanup/recovery                        | **NOT CAUGHT** | PostgreSQL/seeder calls are bounded and failure cleanup mutations are caught, but F3 breaks root recovery independence; F2 leaves partial prerequisite data. |
| K5 docs/operator path                             | **KILLED**     | Stale TEST-present claim is explicitly superseded; one prerequisite followed by ordinary `deploy-test.sh` remains canonical.                                 |

Aggregate: kill classes **2 killed / 3 not caught**. Fault-injection classes **5/5 produced the required red signal**; additionally, one new acceptance oracle is red on the unmodified candidate.

## Validation commands

- `node --test deploy/host/reconcile-saas-test-walkthrough-fixtures.test.mjs` on the original candidate tests → `19 passed / 0 failed`.
- The same command after the audit acceptance additions → `21 passed / 1 failed`; the sole failure is F3’s intentional oracle.
- `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/migrate-local.test.mjs` → `57 passed / 0 failed`.
- `bash apps/webapp/scripts/check-drizzle-migration-order.sh` → transaction-safe migration layout `OK`; migration order `OK`.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` → exit `0`.
- `node scripts/check-migration-privileges.mjs` → `OK (20 migration files)`.
- `node scripts/check-migration-privileges.mjs --self-test` → `OK (7 red fixtures, 1 green fixture)`.
- `node scripts/check-no-new-raw-sql.mjs` → `OK`, production debt `0`.
- `git diff --exit-code <base>..<candidate> -- apps/webapp/db/drizzle-migrations/meta/_journal.json` → exit `0`.
- `git diff --check <base>..<candidate>` → exit `0`.
- Dedicated worktree initially had no dependencies; `pnpm install --frozen-lockfile --offline` completed without lockfile change before dependency-backed gates. No pnpm/Corepack execution was reintroduced into the privileged fixture child.

## Findings and verdict

**FAIL.** Findings: F1 conflicting definitions silently accepted; F2 non-atomic two-version fixture reconcile; F3 root recovery coupled to baseline input. No product fix was made. The audit adds only the missing acceptance coverage/harness isolation and this report.

## Live gates not performed

- NOT DONE: named DEV/TEST catalog mutation, migration execution, TEST fixture, TEST deploy and runtime verification.
- NOT DONE: full CI, push, disposable DB, restore/replay and PROD.
