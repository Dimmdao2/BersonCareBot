# B0 named-DEV DB behavior — independent re-audit, 2026-08-17

Candidate: `1b43129a70a061c519db52fb9cc6fe2610ab742d`  
Verdict: **FAIL**. DEV, TEST and PROD were not contacted or mutated. The candidate's product code was not fixed by
this audit. The committed audit mutation tests intentionally remain red on the candidate.

## Gate summary

| Gate | Result | Independent evidence |
| --- | --- | --- |
| Exact named-DEV target refusal | **PASS** | Runner unit/audit tests pass 9/9; self-test passes and fixes all four DB URLs to `127.0.0.1:5432/bcb_webapp_dev`, with independent `port-context` checks. |
| Bounded recovery / reminder idempotency | **PASS for the implemented code** | Reminder tests pass 2/2 and fail after removing the existing-rule short circuit; webapp typecheck and changed-file ESLint pass. No live mutation was run. |
| Exact 35-file product-test census | **PASS** | Independent executable recount returns 35 files / 121 declarations and excludes method calls. |
| Complete disposition of all 123 removed executors | **FAIL** | Registry exactly equals the 123 paths deleted by `fb44002ce`, but the replacement matrix classifies only 35 paths. The other 88 include independent product/security behavior oracles, not only harness plumbing. |
| B0 no-disposable/no-history-replay gate | **FAIL** | Three directly executable equivalents survive: DB DDL through a local variable, a history file piped to `psql`, and `psql` spawned with file contents on stdin. Fixed audit test: 5 pass / 3 fail. |
| Historical evidence and active documentation | **FAIL** | 60 active documents were mechanically relinked to the retirement note; 86 lines now present `node .../RETIREMENT.md` as a command. The command fails with `ERR_UNKNOWN_FILE_EXTENSION`, while historical audit outputs remain falsely attached to it. |
| Strict typing | **PASS** | `pnpm --dir apps/webapp run typecheck` passes after the required workspace packages are built; changed application files pass ESLint. |

## Findings with reachable impact

### F1 — The B0 gate permits ordinary executable disposable/replay equivalents

The checker recognizes a SQL literal directly inside `.query(...)`, but not the same literal assigned to a local
variable. It recognizes selected `psql` arguments and redirects, but not a file piped into `psql` or a JS child
process supplied with that file through `input`.

Fixed failing oracle:

```bash
node --test scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
# 5 pass / 3 fail
```

The three survivors are directly runnable by an agent:

```js
const statement = 'CREATE DATABASE bcb_throwaway';
await client.query(statement);
```

```sh
cat apps/webapp/db/history.sql | psql "$DATABASE_URL"
```

```js
spawnSync('psql', [], { input: readFileSync('apps/webapp/db/history.sql') });
```

Impact: an agent can recreate a disposable database or replay historical SQL while the mandatory B0 gate prints
`OK`. This violates the owner requirement in AGENTS §1 that pre-B0 history is unavailable and never replayed.

### F2 — Historical logs were rewritten into false, executable-looking evidence

The correction mechanically replaces deleted command/test paths inside active plans, reports and audit logs with a
Markdown retirement note. Exact measurements:

```bash
rg -l 'docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT\.md' docs .cursor | wc -l
# 60

rg -n 'node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT\.md' docs .cursor | wc -l
# 86

node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md
# exit 1: ERR_UNKNOWN_FILE_EXTENSION ".md"
```

Reachable examples:

- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/AUDIT_LOG.md` now claims that the Markdown command exited 0 and proved
  PostgreSQL privilege behavior.
- `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_REPORT.md` now claims that the same Markdown command produced
  `41|28` and ACL/settings evidence.
- `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_BROADCAST_INDEPENDENT_AUDIT.md` calls the retirement note a new
  disposable-PostgreSQL acceptance test and says it reuses `vitest.postgres.config.ts`.

Impact: an agent following the active record gets a broken command; a reader also cannot reproduce or distinguish
the historical evidence because the old result is attributed to a different file. AGENTS §0 explicitly says not to
rewrite historical logs, audit records or archived plans. The safe disposition is to archive/move the whole stale
record (preserving its historical command), and write a separate current retirement instruction—not rewrite the
historical command and keep its old output.

### F3 — The matrix does not account for the whole removed executor set

The registry itself is exact and all registered paths are absent:

```text
deletedAtRetirement=123
registry=123
unique=123
missingDeleted=0
extraRegistry=0
presentNow=0
```

But the matrix census covers only 35 deleted product Vitest files / 121 declarations. It does not classify the other
88 registered paths: 56 `.mjs`, 16 SQL, 8 TypeScript support/executor files, 5 shell files, 2 disposable-harness
PostgreSQL tests and 1 other test. Some are only harness plumbing, but several are standalone behavior oracles. For
example, the deleted `check-branches-quota-race.mjs` asserts serialized quota enforcement under a real race, and
`check-b1-payment-capture-replay.mjs` asserts crash/retry/idempotent payment completion. Neither consequence is a row
in the 35-file matrix.

Impact: the retirement note directs future work to this matrix as the replacement accounting, so these omitted
behaviors disappear from the work queue. A future named-DEV pass can therefore be called complete without ever
checking them. This violates the requirement to classify by human/architecture consequence rather than by the
filename shape that happened to be counted.

The matrix is honest about the subset it does count: of its 121 declarations, only 2 have a static oracle and 10 are
READY but not live-run; 94 product/worker plus 9 security/catalog consequences remain unproved and 6 are explicitly
retired. Therefore deletion of the 35 test files is **not** proof that their behavior became disposable or obsolete;
103/121 counted consequences still need compliant named-environment evidence.

## Passing evidence and mutation evidence

```bash
node scripts/check-b0-migration-baseline.mjs
# PASS: B0 + 18 webapp forwards + 0 integrator forwards

node --test scripts/check-b0-migration-baseline.audit.test.mjs
# PASS: 4 groups; saved 18/18 faults killed

node --test scripts/census-retired-postgres-tests.test.mjs
# PASS: 2/2; 35 files / 121 declarations

node --test apps/webapp/scripts/named-dev-db-behavior-runner.test.mjs \
  apps/webapp/scripts/named-dev-db-behavior-runner.audit.test.mjs
# PASS: 9/9

pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
# PASS: refusal checks + 10-call registry; no HTTP/DB request

node --experimental-strip-types --test deploy/postgres/privileges/retired-db-security-oracles.test.mjs
# PASS: 5/5 declaration/generator groups; this does not prove installed catalog state

pnpm --dir apps/webapp exec vitest run src/modules/reminders/service.idempotency.test.ts
# PASS: 2/2

# Blind mutation: remove the existing-rule short circuit, then run the same command
# FAIL: 1/2, proving the test observes duplicate create behavior; mutation was reverted

pnpm --dir apps/webapp run typecheck
# PASS

pnpm --dir apps/webapp exec eslint <candidate application files>
# PASS
```

The first parallel mutation-test attempt was discarded as invalid audit evidence: two test processes used the same
temporary filenames and interfered. The same gates were repeated sequentially; they passed and left no temporary
files.

## Required correction stages

1. **B0 refusal gate:** kill the three saved executable mutations without pinning inert prose. Keep all existing
   saved mutation suites green in a sequential run.
2. **Historical records:** revert the mechanical command substitutions. Move genuinely stale historical
   plans/logs/reports intact into the non-routable archive, or mark the enclosing record historical without changing
   the command/result it actually recorded. Active runbooks must contain a real current command or an explicit
   non-command retirement statement.
3. **Complete consequence inventory:** classify all 123 removed paths, not only 35 Vitest files. Collapse helpers and
   duplicates, but place every independent product/security consequence into an exact static, named-DEV READY,
   required, or owner-authorized retired bucket with a traceable source path.
4. **Fresh audit before live use:** rerun the saved gates and independent fault set. Only after PASS may the one
   serialized named-DEV runner execute and turn observed READY consequences into PASS. TEST remains later; PROD stays
   untouched.

