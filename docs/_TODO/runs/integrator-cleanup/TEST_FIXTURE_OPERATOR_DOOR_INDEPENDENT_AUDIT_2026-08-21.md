# Independent security/data audit — TEST walkthrough fixture operator door

Date: 2026-08-21

Candidate: `ae5b37aa32461223e679483cf272cf3013be5a20`

Base: `feat/doctor-ui-rebuild` at `c705d6efe946f2300003c2ca65437b2a77e77ad6`

Verdict: **FAIL**. The operator wrapper does not meet the worker brief's security and recovery contract.

## Frozen blind kill-set result

The kill-set was frozen from the authority before the candidate tests were read. Four of ten named classes pass; six do not.

| # | Kill class | Evidence mode | Result |
|---|---|---|---|
| 1 | Wrong host, checkout, database, packet/symlink | behavior | **FAIL** — host, DB and packet refusal work; a non-Git source tree is accepted and receives temporary authority |
| 2 | Secrets, DB URL or opaque IDs in argv/output/files | behavior | **FAIL** — `DATABASE_URL` is placed in `sudo/env` argv; an early failure leaves the password file |
| 3 | Elevation survives success/failure/signal/cleanup failure/timeout | behavior | **FAIL** — cleanup works only after the late trap is installed; pre-trap credential setup has no cleanup |
| 4 | Partial data or false transactional reconciliation | behavior + callgraph | PASS — the existing seeder is invoked with double-run proof and each reconciliation is wrapped in its existing Drizzle transaction |
| 5 | TEST writer race or unintended service state | exact inspection | **FAIL** — only the deploy lock is held; writers are neither quiesced nor coordinated by a shared DB lock |
| 6 | Stationary grants, RLS, role/group/capability/migration widening | exact diff | PASS — no such candidate change |
| 7 | Second raw-SQL fixture, reset/restore/historical/disposable DB, PROD path | exact diff/callgraph | PASS — wrapper calls the existing seeder and contains only the fixed TEST target |
| 8 | Tenant-wall proof deleted/skipped/weakened | exact diff | PASS — the executable tenant-isolation proof is unchanged and remains in `deploy-test.sh` |
| 9 | Injection, unsafe cleanup/collision, unbounded waits/retry | behavior + exact inspection | **FAIL** — caller-controlled `PATH` is executed as `deploy`; database identity/create/cleanup calls are unbounded |
| 10 | Tests grep source or mock away safety | fault injection | **FAIL** — original tests missed four reachable failures; added behavior tests catch them and kill host-guard, cleanup-trap and double-run mutations |

Executable acceptance count on the unmodified candidate: **7 caught, 4 not caught** (`11` scenarios total). The four failures are deliberately committed as the repair oracle.

## Findings

### F1 — source checkout identity is not enforced before elevation

Reachable scenario: `/home/dev/dev-projects/BersonCareBot` exists with the expected regular script files but is not a Git checkout (or is the wrong checkout content). The wrapper checks only `realpath` plus regular files, proceeds, writes the credential packet and creates a temporary PostgreSQL superuser.

Impact: arbitrary/stale local source can run with the temporary database authority instead of the audited source revision.

Violated authority: worker brief kill-set item 1 (wrong checkout) and the requirement that the fixed reviewed source checkout be used.

Executable evidence: `rejects a source tree that is not a git checkout before temporary authority` fails because exit status is `0` and elevation was created.

### F2 — protected connection data is exposed in argv

Reachable scenario: every successful seed invocation passes `DATABASE_URL=postgresql://<temporary-role>@127.0.0.1/...` as arguments to `sudo env`. Local process inspection and command transcripts can read it.

Impact: the temporary privileged role and database target cross the required non-argv boundary; the design no longer has a single protected credential packet boundary.

Violated authority: worker brief requirement that secrets, DB URL and opaque IDs never enter argv, stdout/stderr, transcript or committed files.

Executable evidence: `success runs existing seeder without leaking credentials and removes temporary authority` rejects the recorded `DATABASE_URL=` argv.

### F3 — failure before trap installation leaves the temporary credential file

Reachable scenario: after the password is written, `sudo chown deploy:deploy "$PGPASS"` fails (including a real ownership/permission mismatch before the subsequent caller-side `chmod`). The `EXIT` trap is installed later, so the file remains.

Impact: a privileged temporary credential persists on disk after a failed operator run.

Violated authority: worker brief requirement for elevation cleanup on every failure/interruption and kill-set items 2–3 and 9.

Executable evidence: `a failure while securing the temporary credential still removes it` fails because the injected early failure leaves the password file.

### F4 — PostgreSQL safety and cleanup calls have no bounded wait

Reachable scenario: the database identity query, role creation, role termination/drop or post-drop verification blocks on PostgreSQL. Only the seeder command has `timeout`; the wrapper itself remains indefinitely blocked. An interruption during an unbounded cleanup can also preserve elevation and recovery state indefinitely.

Impact: the operator door can hang forever and cannot guarantee bounded cleanup/service recovery.

Violated authority: worker brief kill-set items 3 and 9 (command timeout and cleanup survival).

Executable evidence: `a hung database identity check is bounded by the wrapper` observes the wrapper still running after the test deadline and must kill it.

### F5 — caller-controlled PATH is executed under the deploy account

Reachable scenario: an operator prepends a controlled directory to `PATH`. The wrapper forwards that value through `sudo -u deploy env -i PATH="$PATH"`; `timeout` and `node` are then resolved from it as `deploy`.

Impact: caller-controlled code executes as `deploy` and can read the protected packet or replace the reviewed seeder execution.

Violated authority: worker brief kill-set items 2 and 9 (secret non-leak, shell injection/collision) and the fixed reviewed source-path boundary.

Evidence: exact argv/callgraph inspection of the wrapper; the behavior transcript confirms the inherited path is forwarded.

### F6 — active TEST writers are not coordinated with reconciliation

Reachable scenario: webapp, worker, integrator or another TEST writer changes reserved walkthrough rows during/between the seeder's two transactions. The wrapper holds the deploy filesystem lock only; it neither stops writers nor takes a DB advisory lock shared with them.

Impact: reconciliation can overwrite concurrent fixture changes, produce non-deterministic results, or claim a stable double-run proof across a state that another writer changed.

Violated authority: worker brief kill-set item 5 and `docs/ARCHITECTURE/HARD_MIGRATION_PROTOCOL.md` hard rule requiring writers to be stopped for the fixture/migration window.

Evidence: exact wrapper/seeder/deploy callgraph inspection. Candidate docs explicitly state that services are not stopped.

## Validation and fault injection

- `bash -n deploy/host/reconcile-saas-test-walkthrough-fixtures.sh` — PASS.
- `node --check deploy/host/reconcile-saas-test-walkthrough-fixtures.test.mjs` — PASS.
- `node --test deploy/host/reconcile-saas-test-walkthrough-fixtures.test.mjs` — expected FAIL: 7 pass, 4 fail.
- Host-guard no-op mutation + wrong-host test — RED; restored.
- Cleanup-trap no-op mutation + failure/interruption tests — 0 pass, 2 fail; restored.
- Double-run flag mutation `1 -> 0` + deterministic invocation test — RED; restored.
- `git diff --check` — PASS.
- `shellcheck` — unavailable on this host.
- TypeScript checks — not applicable; the audit changes no TypeScript.

No named DEV/TEST database, systemd unit, environment packet, deploy checkout, network, disposable PostgreSQL or PROD resource was touched.

## Precise repair handoff

Keep the new acceptance tests unchanged and make all eleven green. The wrapper must validate the exact reviewed source checkout before any credential/elevation, install cleanup before creating any temporary file/state, keep DB URL and opaque role identity out of argv/transcripts, use a fixed trusted executable path, bound every PostgreSQL operation including cleanup, and coordinate TEST writers through the authority-approved quiescence/lock path. Product implementation was not edited by this audit.
