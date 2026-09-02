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
