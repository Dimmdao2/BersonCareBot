# Corrected B0 named-DEV candidate — independent re-audit 1, 2026-08-17

Candidate: `35fa7b8ac92d15dd3fcadd461bd6960ca39d6656`

Parent: `bc42bd99391df848aa56399886be2ebfecf84b0d`

Prior independent FAIL: `286e735e73d4fef47d7a011fb0489729dc644226`

Verdict: **FAIL**.

No live DB, DEV, TEST, PROD, server, worker, scheduler, migration, reconcile or delivery action was run. All audit
mutation files were removed after their single gate invocation. The final tree contains only this report.

## Status of the prior findings

### 1. Effective PostgreSQL target semantics — PASS

Both named-DEV guards now reject every connection-string query parameter and inspect the effective host, port and
database through `pg.Client`. Independent probes against both guards returned `REJECTED` for each of:

```text
host=203.0.113.10
hostaddr=203.0.113.10
port=6543
dbname=bersoncarebot_test
database=bersoncarebot_test
service=production
sslmode=disable
```

The normal canonical URLs still pass the self-test. This closes the remote `?host=`/`?port=` escape found by the
first audit.

### 2. Exact six B0-gate bypasses — PASS; corrected gate remains incomplete — FAIL

The committed mutation suite now kills the exact six bypasses from audit one. Combined with the earlier suites,
`node --test scripts/check-b0-migration-baseline.audit.test.mjs
scripts/check-b0-migration-baseline.named-dev.audit.test.mjs` passed 14/14 subtests.

However, four direct neighboring variants were independently injected. For every row the exact command
`node scripts/check-b0-migration-baseline.mjs` returned exit `0` and printed `OK`: **0/4 killed, 4/4 uncovered**.

| Independent mutation | Gate result |
| --- | --- |
| JS: `const args = ['-f', history]; spawnSync(executable, args)` | UNCOVERED |
| Python: `command = ['createdb', name]; subprocess.run(command)` | UNCOVERED |
| shell: `database_client=psql; "$database_client" ... -f history.sql` | UNCOVERED |
| Dockerfile: `FROM docker.io/library/postgres:17` | UNCOVERED |

These are not speculative obfuscations. They are the same four callable classes already claimed by the correction,
with one additional local binding or a normal fully-qualified container image. They can recreate a disposable
database or replay SQL while mandatory lint remains green.

Impact: the checkout does not currently contain one of these injected files, but the executable regression barrier
still does not make the owner prohibition fail-closed. A later agent can reintroduce the forbidden path with an
ordinary refactor of a command into a variable.

Required correction: the semantic scanners must propagate static arrays/command lists and cover process calls that
receive them; shell command resolution must handle quoted variable-resolved `psql`; Docker image identity must use
the final repository component, not only an unqualified image name. Commit these four faults to the existing
self-test matrix.

### 3. SQL-source oracle and working-hours READY states — PASS

- `deploy/postgres/privileges/reminder-materialization-boundary.test.mjs` is removed.
- Its two SQL-text claims are now `required-current-oracle`.
- Both working-hours declarations are now `required-current-oracle`.
- The matrix no longer presents any of those four declarations as static/READY evidence.
- The two truncated titles identified by audit one are restored exactly.

The resulting stored disposition arithmetic is internally consistent as written:

```text
static-product=3
static-security=9
named-dev-ready=20
required-current-oracle=83
retired-owner=6
sum=121
```

### 4. Exact source census and actionable mapping — FAIL

The census still undercounts the deleted product suite. An independent TypeScript-AST recount found **35 files /
122 declaration expressions**, not 121. The missing declaration is in
`appointmentReminderDelivery.postgres.integration.test.ts`:

```text
it.each([...])('terminalizes before provider when the recipient becomes %s', ...)
```

Its table contains `statement_timestamp()`, so the regex
`it.each\s*\([^)]*\)\s*\(` stops at the inner `)` and misses the entire declaration. The existing census unit test
uses only a simple `.each([1, 2])` fixture and therefore stays green.

Impact: the archived inventory and matrix have no actionable row for the archived/merged/globally-muted recipient
terminalization consequence. The candidate's prominent `83 required` / `92 required including security` statements
are one short. With the newly discovered declaration left open, the product arithmetic must be 122 total and at
least 84 `required-current-oracle` declarations; the combined open product+security total is at least 93.

Required correction: replace the regex census with TypeScript AST call-expression counting (one `.each` declaration,
not one per table row), add the exact missing title/consequence as required, and recompute every total/report from
the executable inventory.

## Other verified properties

- `node scripts/check-retired-db-consequence-inventory.mjs` currently reports the stored 123 path classification as
  35 product files, 55 independent oracles, 29 support files and 4 history files. The 55 independent oracles remain
  explicitly open; no report promotes them to green.
- Exact filesystem comparison reports `0` of the 123 retired executor paths present.
- Active migration layout is B0 plus 19 webapp forwards and zero integrator forwards; no historical chain is active.
- The historical/non-runnable documentation notices remain intact. The correction did not delete historical docs or
  support records while fixing the four first-audit findings.
- The current reminder step remains internal to the single `test:db-behavior:named-dev` wrapper and receives one
  authenticated organization UUID.
- `pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test` passed 11 runner assertions, 4 current-step
  assertions and canonical-file validation without HTTP/DB access.
- Census/inventory committed tests passed 3/3, demonstrating the current false oracle rather than correcting it.
- Declaration/security tests passed 7/7.
- `pnpm typecheck` passed all selected workspaces.
- `pnpm lint` passed root and webapp lint, including the currently incomplete B0 gate.

No READY declaration was executed or promoted to PASS in this re-audit.
