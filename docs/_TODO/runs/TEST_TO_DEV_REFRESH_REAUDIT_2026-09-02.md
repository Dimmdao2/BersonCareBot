# TEST → DEV refresh — bounded correction re-audit, 2026-09-02

## Verdict

**PASS** for correction commit `69cef14882523487f85ed08b263d5165be453822`.

The original F1–F4 kill-set is closed on the corrected surfaces. The refresh is ready to land as an
owner-gated entrypoint; this verdict does **not** claim that the live refresh ran. No named DEV/TEST database,
service, env file, external channel or PROD resource was touched. No disposable/scratch database, historical
migration replay, full CI, deploy or service stop was used.

Authority: step 6 of
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, the complete first audit
`docs/_TODO/runs/TEST_TO_DEV_REFRESH_INDEPENDENT_AUDIT_2026-09-02.md`, the re-audit brief, and the active
AGENTS/server/DEV/DB-dump canons named there.

## Test-or-view classification fixed before checking

Per `AGENTS.md` §24.4, mixed requirements were split by the nature of the claim rather than forced into one
method.

| Required item | Classification | Reason |
| --- | --- | --- |
| 1. Closed target, failure/signal recovery, one reopen | **TEST** for observable success/failure/signal paths; **VIEW** for the single success-boundary call graph | Repeated wrapper behavior needs fault oracles; absence of another reopen is final source topology. |
| 2. Canonical migration inside success; inherited lock; no duplicate runner | **TEST** for re-entry, arbitrary FD, third-party exclusion and failed gate; **VIEW** for the successful execute call graph | Locking and failure are behavior; “no second path” is a one-time structural fact. |
| 3. Env integrity with only declaration-owned outputs mutable | **TEST** for an unauthorized write and a legitimate capability rewrite; **VIEW** for the exact digest exclusions | The guard's response is behavior; the excluded key set is final source state. |
| 4. Absent-org policy, value-equal settings and signing secret | **TEST** with row/value assertions and policy mutations; **VIEW** of the SQL assertions | Data results are behavior; SQL topology is inspected once. |
| 5. SQL stdin and interruption/cleanup | **TEST** with a planted stdin regression plus the signal test; **VIEW** of FD handoff/traps | Both are repeated process behavior; the FD/trap topology corroborates it. |
| 6. Independent fail-closed SQL oracle | **TEST** for SQL semantics, unknown SQL and required mutations; **VIEW** of parser/executor boundaries | The model must execute behavior and must not silently accept an unmodelled statement. |
| 7. Original identity/privacy/non-PROD protections | **TEST** for refusals, privacy and cleanup; **VIEW** for fixed identities, dump flags and absence of replay/scratch machinery | Refusal paths are behavior; fixed command topology is final state. |

## Required proof

1. **PASS — closed target and recovery boundary.** `refresh-dev-from-test.sh` recreates DEV with one
   `CREATE DATABASE "bcb_webapp_dev" OWNER postgres TEMPLATE template0 CONNECTION LIMIT 0`; the modelled
   event stream has no target operation while the target is connectable. `assert_target_closed` runs after
   recreate, after DEV-state restore, and after the migration gate. The execute path has one `reopen_target`
   call, after all gates. Rollback has its own mutually exclusive reopen after its reconcile. Any failure after
   `DESTRUCTIVE_PHASE_STARTED=1` leaves the database at limit 0 and prints the exact
   `--rollback <snapshot>/dev-before.dump --confirm-refresh-dev-from-test` action. INT/TERM/HUP kill the active
   process group and run the same exit cleanup.

2. **PASS — canonical migration and inherited lock.** Execute invokes exactly
   `bash deploy/host/migrate-dev.sh --execute --host-lock-fd 9` before reopen/PASS. The old execute-side
   reconcile copy is gone; `reconcile_declaration` is reachable only from rollback. `migrate-dev.sh` accepts
   an inherited descriptor only when `/proc/self/fd/<n>` is open and resolves to the exact shared lock path,
   then calls `flock -n` on it. Tests prove same-open-description re-entry does not deadlock, a descriptor for
   another file is refused, a closed/non-numeric/stdio descriptor is refused, and a different open description
   cannot enter while a third party holds the lock. The canonical migrator remains the sole successful
   execute migration/reconcile path.

3. **PASS — env integrity.** The digest removes only the two declaration-owned capability variable names
   (`WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON`, `INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON`) and their generated
   marker line; all other bytes remain in the digest. A planted unrelated env write blocks PASS, while the
   canonical capability-line rewrite is accepted. Runtime passwords, URLs, signing secrets and every other
   DEV env value are therefore outside the exception.

4. **PASS — DEV-owned rows and exact signing value.** The restore builds
   `dev_owned_setting_absent_org`, restores only global rows and rows whose organization exists in accepted
   TEST, and asserts: restored count equals captured minus dropped; every restorable captured row is
   value-equal; no absent-org row returned. Only the count leaves PostgreSQL through `:absent_org_out`; the
   wrapper validates it and prints `dev_owned_settings_dropped_absent_org=N` plus the policy explanation,
   without printing key/org/value. Signing restore asserts one captured row, one live row and equality to the
   captured DEV secret—not merely row count. Result-row tests prove TEST settings/lock/signing secret are gone,
   TEST product state arrives, restorable DEV values are exact, the DEV signing secret is exact, the existing
   organization row returns and the absent-organization row is counted/dropped.

5. **PASS — real stdin, signals and cleanup.** `run_tracked` duplicates its own stdin on FD 8 and starts the
   asynchronous `setsid --wait` child with `<&8`; both capture and restore therefore deliver the repository SQL
   to real `psql` stdin. Removing `<&8` makes the happy-path test fail at capture because no output file exists.
   Signal handling still targets the whole process group; value-bearing temporary directories are private and
   cleanup tests pass. Post-boundary failure deliberately retains only the protected recovery snapshot and
   names how to use/shred it.

6. **PASS — SQL model is an independent, fail-closed oracle for this bounded SQL.** The model tokenizes/parses
   and executes the committed capture/restore SQL over synthetic PII-free rows; it does not encode the expected
   refresh result as a second capture/restore procedure. Its independent tests exercise DELETE predicates,
   accepted/rejected FK inserts, transaction rollback, division-by-zero assertions, correlated `NOT EXISTS`,
   object removal and early `\\quit`. Unsupported SQL and unsupported psql meta-commands throw loudly. Wrapper
   tests then assert independent expected final rows/values. The old `\\quit 0`, missing signing repin, and
   absent-org-policy mutations all turn the wrapper behavior red. A named DEV/TEST PostgreSQL oracle is not
   needed for this bounded re-audit; live `--execute` remains the later owner gate.

7. **PASS — original protections remain.** Source/target/host/PROD identities are constants with no database
   argument. Exact confirmation is required before any probe in destructive modes; `--check` refuses the
   confirmation and does not dump/drop/restore/migrate/write env. TEST transport uses `--no-owner --no-acl` on
   both dump and restore; DEV recovery snapshot keeps DEV ownership. Value files live in a postgres-owned 0700
   work directory and are mode 0600; values are absent from argv/output. TEST env is never read. No historical
   replay or scratch/disposable database path exists.

## Exact validation commands

Worker commands reproduced:

```bash
bash -n deploy/host/refresh-dev-from-test.sh && bash -n deploy/host/migrate-dev.sh
```

Result: exit 0.

```bash
node deploy/host/dev-owned-settings-policy.mjs --self-test
```

Result: `PASS (registry=155 restricted=59 testEnv=21 devOwned=69)`.

```bash
node --test deploy/host/dev-owned-settings-policy.test.mjs deploy/host/refresh-dev-from-test.test.mjs
```

Result: `tests 41`, `pass 41`, `fail 0`.

```bash
node --test deploy/host/migrate-dev.test.mjs
```

Result: `tests 17`, `pass 17`, `fail 0`.

```bash
node --test deploy/host/dev-refresh-sql-model.test.mjs
```

Result: `tests 9`, `pass 9`, `fail 0`.

Required SQL mutation classes isolated in one command:

```bash
node --test --test-name-pattern='the DEV signing secret is re-pinned|a neutered DEV-state restore cannot pass|without the absent-organization policy' deploy/host/refresh-dev-from-test.test.mjs
```

Result: `tests 3`, `pass 3`, `fail 0`; each test passes only because its planted bad wrapper/SQL behavior is
rejected with no execute PASS.

Additional scoped lint probe (not a required worker gate):

```bash
pnpm exec eslint deploy/host/dev-refresh-sql-model.mjs deploy/host/dev-refresh-sql-model.test.mjs deploy/host/migrate-dev.test.mjs deploy/host/refresh-dev-from-test.test.mjs
```

Result: exit 254, `Command "eslint" not found`; dependencies are not installed in this worktree. No install or
full CI was performed because the brief prohibits expansion and the exact Node/shell gates above are green.

## Fault-injection map

| Fault planted | Exact command / oracle | Observed result |
| --- | --- | --- |
| Old F4 mutation: `\\quit 0` immediately after `\\set ON_ERROR_STOP on` | Three-pattern Node command above → `a neutered DEV-state restore cannot pass` | Mutated copy cannot reach execute PASS; row-state oracle catches the no-op. |
| Signing repin DELETE/INSERT removed | Three-pattern Node command above → `the DEV signing secret is re-pinned…` | Value-equality/row oracle rejects retained TEST signing secret. |
| Absent-org predicate removed; every captured row inserted | Three-pattern Node command above → `without the absent-organization policy…` | Modelled FK aborts the transaction after the boundary; recovery is named; no PASS. |
| `run_tracked` child stdin changed from `<&8` back to background `/dev/null` | `node --test --test-name-pattern='--execute copies accepted TEST product data' deploy/host/refresh-dev-from-test.test.mjs` | Exit 1; assertion red at `capture did not produce its output files`. |
| `CONNECTION LIMIT 0` removed from CREATE DATABASE | `node --test --test-name-pattern='the recreated DEV target is born closed' deploy/host/refresh-dev-from-test.test.mjs` | Exit 1; `assert_target_closed` reports limit `-1`, leaves recovery named, no PASS. |
| Canonical migration gate replaced temporarily with `return 0` | `node --test --test-name-pattern='PASS is unreachable without the canonical migrate-dev gate' deploy/host/refresh-dev-from-test.test.mjs` | Exit 1; exact migrate-dev invocation assertion red. |
| Migration gate returns nonzero | Full 41-test command → `a failed migration gate is not an after-PASS instruction…` | Refresh nonzero, target limit remains 0, exact rollback action printed, no PASS. |
| Arbitrary/closed/non-numeric inherited FD | Full 17-test migrate command → lock tests 16–17 | Refused before migrations. |
| Same holder re-enters; third process owns another description | Full 17-test migrate command → lock tests 14–15 | Same description completes without deadlock; third-party-held lock refuses. |
| Unauthorized DEV env mutation | Full 41-test command → `an env file written during the run…` | Digest mismatch blocks PASS. |
| Unknown SQL statement | Full 9-test model command → `SQL the model does not understand…` | Nonzero `unsupported statement`; never a silent no-op. |
| SIGTERM during tracked dump | Full 41-test command → signal cleanup test | Nonzero exit and no key/credential temp directory leak. |

All production-file mutations above were reverted immediately. Exact restoration check:

```bash
git diff --exit-code 69cef1488 -- deploy/host/refresh-dev-from-test.sh
```

Result: exit 0. Before writing this artifact, `git status --short` produced no output.

## Bounded conclusion

F1, F2, F3 and F4 are closed on `69cef1488`. No in-scope failing acceptance test or reachable owner/repo-rule
violation remains. The only deferred operation is the explicitly owner-gated live TEST → DEV refresh after an
accepted TEST; this PASS authorizes landing the entrypoint, not executing that operation.
