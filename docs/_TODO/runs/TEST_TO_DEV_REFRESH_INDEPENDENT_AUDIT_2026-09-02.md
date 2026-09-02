# TEST → DEV refresh — independent audit, 2026-09-02

## Verdict

**FAIL, NOT FOR LAND** for feature commit `8c917be13c6ec41cb5914d2f99cef024021bb2dd`, inspected at branch
HEAD `5a8c39f99165f383a7d43a3cd0bfe846afa532fe`.

Authority: the owner requirement in step 6 of
`SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, the audit brief, `AGENTS.md` §1/§1a/§1b, and the
server/DEV/DB-dump canons named by the brief. The audit changed no product code and touched no live database,
env file, service, domain, or external channel. Its permanent diff is this artifact only.

## Findings

### F1 — recreated DEV is connectable throughout the destructive restore

Preflight checks listeners on ports 5200/4200 and the currently connected non-`postgres` backends once
(`refresh-dev-from-test.sh:312-330`). The destructive helper then closes the old database, drops it, and creates
a new `bcb_webapp_dev`, but never sets `CONNECTION LIMIT 0` on that newly created database
(`refresh-dev-from-test.sh:438-459`). The original limit is restored only after state restore and declaration
reconcile (`:462-465`, `:588-591`).

Reachable scenario: a hand-started scheduler/worker has no listening TCP port and happens to have no database
backend during the one preflight sample, so it passes the writer gate. After `createdb`, its ordinary retry can
connect through PostgreSQL's default-connectable database and write as soon as the restored relations appear,
while `pg_restore`, DEV-state restore, and reconcile are still running. The wrapper's flock coordinates only the
repo-managed database wrappers; it does not stop that application process.

Impact: concurrent writes can make restore fail after the destructive boundary or can mix new DEV writes into
the accepted TEST image before the final gates. This violates the single-writer/closed-target requirement and
the script's documented promise that interrupted work leaves DEV closed.

### F2 — the wrapper reports PASS before the canonical current-schema migration gate

After restoring the accepted TEST archive, returning DEV-owned state, reconciling declarations, reopening DEV,
and checking env digests, the wrapper sets `REFRESH_COMPLETE=1` and prints `execute: PASS`
(`refresh-dev-from-test.sh:588-597`). Only after that PASS does it tell the operator to run `migrate-dev.sh`
(`:598-599`). It never invokes or gates on that canonical primitive.

Reachable scenario: accepted TEST is one or more forward migrations behind the checkout used to restart DEV.
The refresh returns success and reopens DEV with TEST's older migration ledger/schema; the operator stops at the
successful repo-managed action, or the later migration command fails. Application code can then run against a
stale schema even though the refresh reported PASS.

Impact: the result does not have the required current migration ledger/current-schema state, and failure of the
real migration runner cannot suppress the earlier PASS. `migrate-dev.sh:243-307` is the existing canonical
role-baseline → ordered integrator/webapp forwards → reconcile → runtime-descriptor gate; it must be inside the
success boundary, not an after-PASS instruction.

### F3 — a DEV-owned per-org credential for a DEV-only organization prevents refresh completion

The registry has real `storage: 'restricted', ownership: 'per_org'` credentials, including clinic bot tokens and
`google_refresh_token` (`registry.ts:430-442`, `:552-556`). The capture retains their original
`organization_id`; after TEST restore, the restore SQL inserts every captured row unchanged
(`dev-refresh-restore-dev-owned-state.sql:71-90`). Current schema B has
`system_settings_organization_id_fkey → be_organizations(id) ON DELETE CASCADE`
(`deploy/postgres/generated/prod-to-target/schema-post.sql:8967-8971`).

Reachable scenario required by the brief: DEV contains a clinic-specific restricted setting for an organization
that is absent from the accepted TEST data. The bulk INSERT violates that FK. Its transaction rolls back and the
wrapper correctly avoids PASS, but DEV has already been replaced and can only be returned via the manual
snapshot recovery path.

Impact: the owner-gated refresh cannot complete for a valid difference between the two named environments. The
implementation has no declared policy for the impossible-to-reattach DEV row and the synthetic suite has no
oracle for this mandatory conflict.

### F4 — the synthetic suite does not execute or verify DEV-state SQL semantics

The fake `psql` recognizes `settings_in`, discards the complete SQL from stdin, and returns a configured status
without evaluating a statement (`refresh-dev-from-test.test.mjs:169-172`). The happy-path test consequently
asserts only that an argument named `settings_in` appeared and that the wrapper later called reconcile
(`:371-402`).

Bounded mutation proof: temporarily adding `\quit 0` immediately after `\set ON_ERROR_STOP on` in
`dev-refresh-restore-dev-owned-state.sql` — making TEST-lock deletion, removal of TEST environment values,
restoration of DEV values, signing-secret repin, and exactness checks all no-ops — left the complete wrapper suite
green. Exact command `node --test deploy/host/refresh-dev-from-test.test.mjs` returned `pass 20`, `fail 0`.
The temporary mutation was reverted; `git diff -- deploy/postgres/dev-refresh-restore-dev-owned-state.sql`
returned no output afterward.

Impact: the required independent oracles “TEST secret survives”, “DEV secret missing”, and the organization-FK
conflict do not exist. A regression that transfers TEST credentials or drops DEV credentials can pass CI, so the
green author suite does not prove the core owner requirement.

## Blind kill-set result

1. Exact host/database identity, PROD/other-name rejection, no scratch DB or historical replay — **PASS by
   inspection and synthetic execution**.
2. Exact confirmation, inert check, shared database-wrapper lock, existing-writer refusal — **FAIL overall**:
   confirmation/check/initial writer probes pass, but F1 leaves the recreated target open to a later writer.
3. Pre-boundary DEV snapshot and DEV-owned capture; loud recovery-required state after boundary — **PASS by
   inspection and injected restore/reconcile failures**. The implementation chooses the allowed loud/manual
   recovery branch rather than automatic rollback.
4. TEST archive excludes owners/ACLs; no TEST env read/write; private value files and cleanup — **PASS by
   inspection and the argv/output/env/signal tests**.
5. Registry + TEST-overlay-derived DEV-owned policy; unknown/restricted TEST rows removed — **FAIL**: policy
   derivation is single-sourced, but F3 is unhandled and F4 means the value-transfer behavior is not executed.
6. DEV signing secret/runtime DB credentials remain DEV; TEST roles are not recreated — **NOT PROVEN**: dump
   flags and SQL look correct, but F4 shows the signing/settings SQL can be deleted wholesale without an oracle.
7. Canonical overlay/declaration/reconcile/catalog primitives and fail-closed final gates — **FAIL** due F2.
   Declaration reuse itself passes inspection; no second privilege generator was found.
8. Exact owner/ACL/RLS declaration and current migration ledger after restore — **FAIL** due F1/F2.
9. Synthetic wrapper execution and independent fault oracles — **FAIL** due F4. Existing fake-binary tests do
   exercise wrong host/DB, confirmation, env mutation, reconcile failure, secret output/argv scans, SIGTERM
   cleanup, and partial-restore false-PASS rejection.
10. Active docs distinguish ordinary DEV development from the explicit post-accepted-TEST exception and do not
    claim the live refresh ran — **PASS by inspection**. W10 is marked complete from separately recorded real
    migration/snapshot commands, while step 6 explicitly says the refresh action is not executed.

## Fault-injection oracle map

| Independent failure class | Oracle exercised | Result |
| --- | --- | --- |
| wrong host / PROD / wrong DB identity | fake hostname/database catalogs; nonzero + no dump/drop | red on fault |
| missing destructive confirmation | execute/rollback without exact token; nonzero + no mutation | red on fault |
| env touch | watcher mutates fake DEV env after capture; no PASS | red on fault |
| TEST secret survives | restore SQL replaced by no-op | **stayed green — missing oracle (F4)** |
| DEV secret missing | same no-op mutation removes repin/restore | **stayed green — missing oracle (F4)** |
| reconcile failed/skipped | injected reconcile failure and happy-path call assertion | red on failure/omission |
| secret in output/argv | fake credential markers scanned in captured calls/stdout/stderr | red if marker appears |
| signal cleanup | real wrapper process receives `SIGTERM` during held fake `pg_dump` | nonzero, no temp dirs |
| partial state restore false PASS | fake `psql` restore returns 1 | nonzero, rollback named, no PASS |
| DEV-only organization FK | not modeled; fake `psql` discards SQL | **missing oracle (F3/F4)** |
| writer connects after recreate | not modeled; target is visibly not re-closed | **missing oracle (F1)** |
| current migration/ledger gate skipped | wrapper prints PASS before instructing operator to migrate | **no gate (F2)** |

## Validation

- Baseline exact command:
  `bash -n deploy/host/refresh-dev-from-test.sh && node deploy/host/dev-owned-settings-policy.mjs --self-test && node --test deploy/host/dev-owned-settings-policy.test.mjs deploy/host/refresh-dev-from-test.test.mjs`
  → shell syntax and policy self-test passed; `pass 28`, `fail 0`.
- Audit mutation exact command: `node --test deploy/host/refresh-dev-from-test.test.mjs` with the temporary
  restore-SQL no-op → `pass 20`, `fail 0`, proving F4. Mutation reverted before artifact creation.
- Full CI was not run, as explicitly prohibited by the brief.

---

## Correction pass, 2026-09-02 (written by the correction pass, not by the audit)

This section records what changed in response to F1–F4 above. The audit verdict itself is left exactly as
written; nothing above this line was edited. No live TEST/DEV/PROD database, env file, service, domain or
external channel was touched, and no disposable database was created.

- **F1 — recreated DEV is connectable throughout the destructive restore.** The recreate is now a single
  `CREATE DATABASE "bcb_webapp_dev" OWNER postgres TEMPLATE template0 CONNECTION LIMIT 0`, replacing
  `createdb` + a later `ALTER DATABASE` — `createdb` cannot express a connection limit, so the two-step form
  always left a real window. There is now no instant in which a default-connectable `bcb_webapp_dev` exists.
  `assert_target_closed` re-reads `datconnlimit` after the recreate, after the DEV-state restore, before and
  after the migration gate and before the rollback reopen; the original limit is restored at exactly one
  success boundary. Oracle: the model records every cluster event, and the suite asserts that no operation
  touched the target while it was connectable and that the target is reopened exactly once.
- **F2 — PASS before the canonical current-schema migration gate.** `deploy/host/migrate-dev.sh --execute`
  is now invoked inside `--execute`, before the reopen and before `PASS`; the wrapper's duplicated
  reconcile block was removed from that path (it remains only for `--rollback`, which applies no
  migrations), and the after-PASS "now run migrate-dev" instruction is gone. Lock re-entry is a new
  parameter on the existing entrypoint, `migrate-dev.sh --host-lock-fd <descriptor>`: it validates that the
  inherited descriptor is open and resolves to this exact lock file, then `flock`s it. Re-locking the same
  open file description cannot deadlock against its own holder, while a third party holding the lock through
  any other description still refuses the run. No second, lockless migration runner exists.
- **F3 — DEV-owned per-org credential for an organization absent from TEST.** The restore SQL now returns a
  captured row only when its `organization_id` is NULL or present in `public.be_organizations`; a row whose
  organization is absent is deliberately not restored, because it cannot belong to the new DEV data graph and
  inserting it would abort the transaction after the destructive boundary. The policy is fail-loud, not
  silent: `dev_owned_setting_absent_org` is materialized, three assertions cover it (restored count is
  captured minus dropped, every restorable row is present, no dropped row came back), the count is exported
  through `:absent_org_out`, and the wrapper prints both an explanatory line and
  `dev_owned_settings_dropped_absent_org=N` in `PASS`. Keys and organization ids stay inside the database.
- **F4 — the suite did not execute DEV-state SQL semantics.** `deploy/host/dev-refresh-sql-model.mjs` is a new
  executable model of the cluster: it runs the real capture and restore scripts — psql meta-commands,
  `\copy`, the transaction, DELETE/INSERT predicates, the foreign key and the division-by-zero assertions —
  against a synthetic, PII-free fixture, and the suite asserts on the resulting ROWS. Statements the model
  does not implement are a loud error, never a silent pass, and the model has its own test file. The named
  DEV/TEST databases are untouched and reserved for the future live `--execute`. New oracles, each verified
  red under its own mutation: restore SQL neutered with `\quit` (the exact audit mutation), signing-secret
  repin removed, TEST environment values surviving, TEST-only unclassified row surviving, TEST environment
  lock surviving, absent-organization policy removed (FK abort after the boundary), migration gate failing,
  and the target reopened early.
- **Additional defect found by the new oracle, fixed here.** `run_tracked` ran its child asynchronously so a
  signal could reach the whole process group; with job control off, an asynchronous command's stdin is
  `/dev/null` before any explicit redirection, and the `run_tracked … <"$CAPTURE_SQL"` redirection applied to
  the function, not to the async child. Every repository SQL primitive is handed to psql on stdin, so on a
  live run the capture and the DEV-state restore would have read `/dev/null`, executed nothing and exited 0.
  The previous fake `psql` discarded stdin and wrote fixture output regardless, which is why the green suite
  could not see it. `run_tracked` now duplicates its own stdin and hands it to the child by descriptor.

### Validation of the correction pass

- `bash -n deploy/host/refresh-dev-from-test.sh && bash -n deploy/host/migrate-dev.sh` → syntax clean.
- `node deploy/host/dev-owned-settings-policy.mjs --self-test` → `PASS (registry=155 restricted=59 testEnv=21
  devOwned=69)`.
- `node --test deploy/host/dev-owned-settings-policy.test.mjs deploy/host/refresh-dev-from-test.test.mjs`
  → `pass 41`, `fail 0` (the audit's baseline command; it was `pass 28` before this pass).
- `node --test deploy/host/migrate-dev.test.mjs` → `pass 17`, `fail 0` (13 existing + 4 new lock-contract).
- `node --test deploy/host/dev-refresh-sql-model.test.mjs` → `pass 9`, `fail 0`.
- Full CI was not run, as explicitly prohibited by the brief. The live `--execute` remains deferred to an
  accepted TEST; nothing in this pass claims the refresh ran.
