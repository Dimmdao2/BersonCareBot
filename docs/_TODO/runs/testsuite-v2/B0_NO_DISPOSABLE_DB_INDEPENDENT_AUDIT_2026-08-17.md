# B0 / no-disposable-DB — independent audit, 2026-08-17

Candidate: `fb44002ce2b4bbd33e110c01d075e4ffb8d0871b`

Audit branch: `wt/no-disposable-db-audit-20260817`

Authority: `docs/OWNER_DECISIONS.md` § «B0 вместо исторической цепочки миграций» and
`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` § «OWNER-CORRECTION 16.08.2026».

## Verdict: FAIL

The deletion itself moves the checkout toward the owner's B0-only decision, and the surviving migration roots are
exactly B0 plus forwards. The candidate is not safe to land yet because the new permanent gate has reachable blind
spots, active non-archive documentation still instructs agents to invoke deleted disposable/history executors, and
35 product PostgreSQL integration files (130 declared product test calls) were removed without an executable
named-environment replacement matrix.

## MUST FIX 1 — the permanent gate does not cover the repository's callable surfaces

Reachable scenario: a later agent adds a disposable/private-PostgreSQL executor in `tools/`, a workflow, another
workspace package, or uses a spelling/call form not recognized by the raw regex. `pnpm lint` stays green because
`scripts/check-b0-migration-baseline.mjs` scans six hard-coded directories and only three of nine package manifests.
That directly violates the owner requirement that no agent can bring back A0/history/disposable execution.

Measured topology:

```bash
git ls-files | rg '^(scripts|deploy/host|deploy/postgres|apps/webapp/scripts|apps/integrator/src/infra/scripts|docs/_TODO/SAAS_FOUNDATION/scripts)/.*\.(sh|mjs|mts|cjs|js|ts|tsx|sql)$' | wc -l
git ls-files -s | awk '$1=="100755"{n++} END{print n}'
comm -23 <(git ls-files -s | awk '$1=="100755"{print $4}' | sort) <(git ls-files | rg '^(scripts|deploy/host|deploy/postgres|apps/webapp/scripts|apps/integrator/src/infra/scripts|docs/_TODO/SAAS_FOUNDATION/scripts)/.*\.(sh|mjs|mts|cjs|js|ts|tsx|sql)$' | sort) | wc -l
git ls-files | rg '(^|/)package\.json$' | wc -l
git ls-files '.github/workflows/*.yml' '.github/workflows/*.yaml' | wc -l
```

- gate-scanned tracked script/SQL files: `283`;
- executable-bit files: `41`, of which `11` are outside the gate (all under `tools/`);
- workspace `package.json` files: `9`, of which only `3` are parsed;
- workflows: `5`, none parsed.

Blind fault injection (each file was created only for one gate invocation, removed immediately, and final
`git status --short` was empty):

| Injection | Result |
| --- | --- |
| `scripts/*.sh`: shell `psql ... -f legacy.sql` | KILLED |
| `scripts/*a0-greenfield*.sh`: forbidden filename | KILLED |
| `scripts/*.sql`: lowercase `create database ...` | **UNCOVERED** |
| `scripts/*.sh`: `docker run ... postgres:17` | **UNCOVERED** |
| `scripts/*.mjs`: `spawnSync('psql', ['-f', ...])` | **UNCOVERED** |
| `scripts/*.sh`: `psql "$DATABASE_URL" < legacy.sql` | **UNCOVERED** |
| `tools/*.sh`: `createdb ...` | **UNCOVERED** |
| `.github/workflows/*.yml`: `run: initdb ...` | **UNCOVERED** |
| fourth workspace `package.json`: `dropdb ...` | **UNCOVERED** |
| `apps/media-worker/*.mjs`: programmatic `createdb` | **UNCOVERED** |
| root `package.json` command: `createdb ...` | **UNCOVERED** |
| root manifest: forbidden disposable script name with an indirect command | **UNCOVERED** |

Result: `2/12` killed, `10/12` uncovered. This is not a theoretical naming preference: every uncovered example is
a directly callable path that can create/drop/start a database or replay SQL while the mandatory lint gate passes.

Required correction: derive the inventory from all tracked executable/callable surfaces, including executable bits,
all workspace manifests, workflows/actions, Docker/compose and Make/task files. Detect command invocations across
shell and process-spawn forms (including stdin/`\\i` replay), case-insensitive SQL database DDL, PostgreSQL server
processes and any PostgreSQL container tag. Keep an explicit narrow allowlist for current named DEV/TEST deployment
ports, then commit a fault-injection test for every class above.

## MUST FIX 2 — active docs still expose deleted commands and make false readiness claims

Reachable scenario: an agent follows a current non-archive runbook/preflight and runs a command that names a removed
scratch harness or disposable smoke. The command either fails after wasting time or is reconstructed from the
detailed recipe, exactly recreating the path the owner ordered removed.

Exact reference count:

```text
git grep -n -E '(apps/webapp/scripts/postgres-integration/(cli|harness-lib)\.ts|apps/webapp/vitest\.postgres\.(config|globalSetup|setup)\.ts|docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-3-direct-org-policies\.mjs|deploy/postgres/port-context/acceptance\.sh)' -- 'docs/**/*.md' ':!docs/archive/**' | wc -l
24
```

Concrete active examples:

- `docs/_TODO/SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md:145,214` tells the reader to set
  `SCRATCH_DATABASE_URL` and execute the now-deleted scratch smoke.
- `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md:266-282` includes executable `createdb`, scratch smoke,
  raw `psql -f`, and `dropdb` steps for the deleted path.
- `docs/ARCHITECTURE/SECURITY_CANON.md:155-169` says the deleted
  `tenantIsolationMatrix.postgres.integration.test.ts` is a CI test and the deleted
  `rehearse-multitenant-isolation.mjs` remains available. This is now a false readiness record.
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/AUDIT_LOG.md:793` still presents the deleted
  `deploy/postgres/port-context/acceptance.sh` as a committed acceptance command.

Historical result logs can remain historical evidence only if they are unambiguously archived/non-routable. Active
preflights, canons, plans and handoffs must be superseded or moved out of the active route, and the B0 gate must reject
new executable command references to missing retired files outside the historical archive.

## MUST FIX 3 — current database-behavior proof was deleted without replacement

Exact commands/results:

```text
git diff --diff-filter=D --name-only HEAD^ HEAD | wc -l
123

git diff --diff-filter=D --name-only HEAD^ HEAD | rg '\.postgres\.integration\.test\.ts$' | wc -l
37

git diff --diff-filter=A --name-only HEAD^ HEAD | rg '\.(test|spec)\.[^.]+$' | wc -l
0
```

The parent contents of those 37 files contain `133` declared `it(`/`test(` calls; two files and three calls test the
disposable harness itself, leaving **35 product files / 130 declared product test calls**. The candidate adds zero
test files. (The total previously quoted as 131 during triage was corrected by the exact per-file counter: 133 minus
the harness's 3 is 130.)

The counter was:

```bash
node --input-type=module - <<'NODE'
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['diff', '--diff-filter=D', '--name-only', 'HEAD^', 'HEAD'],
  { encoding: 'utf8' }).trim().split('\n').filter((path) => path.endsWith('.postgres.integration.test.ts'));
let calls = 0;
for (const path of files) {
  const source = execFileSync('git', ['show', `HEAD^:${path}`], { encoding: 'utf8' });
  calls += [...source.matchAll(/\b(?:it|test)\s*(?:\.each\s*\([^)]*\)\s*)?\(/g)].length;
}
console.log({ files: files.length, productFiles: files.length - 2, calls, productCalls: calls - 3 });
NODE
```

The removed product proofs include real-PostgreSQL behavior that page traversal cannot establish: tenant A/B
isolation, OTP atomic-attempt races, billing capture/webhook idempotency, quota races, booking read/deactivation
chokepoints, reminder materialization/delivery ownership, media-worker control, platform merge/purge, and definer
bootstrap boundaries. Replacing comments such as “named-DEV proof” is not an executable replacement, and the
candidate performed no DB/server action.

Required correction is **not** to restore the disposable harness. Before deleting each unique product oracle, map it
to a surviving static/unit test or rebuild its user-visible/negative/concurrency consequence against named DEV through
the sanctioned application/Drizzle port; then run and record that matrix. Any proof that is genuinely redundant must
name the exact surviving oracle. Do not silently redirect destructive setup to DEV/TEST.

## Verified good properties

- `node scripts/check-b0-migration-baseline.mjs` — PASS:
  `B0 roots + 18 webapp and 0 integrator forward migrations; no legacy chain`.
- Filesystem inventory: webapp has exactly `0000_b0_baseline.sql` + `0001..0018`; integrator has exactly
  `core/20260816_0000_b0_baseline.sql` and no forwards.
- Exact non-doc search found no surviving `initdb`, `createdb`, `dropdb`, `pg_ctl`, `SCRATCH_DATABASE_URL`,
  `CREATE/DROP DATABASE`, or PostgreSQL container executor outside the checker itself. The only apparent
  `postgres:<number>` hits were ownership strings such as `root:postgres:750`, not container images.
- No surviving code/build/runtime import references the deleted harness paths; remaining exact references outside
  docs are the intentional gate/README wording.
- No deleted disposable harness was silently redirected: changed fixture/purge guards reject scratch/rehearsal and
  require exact named targets. Direct pure-guard matrix passed: named DEV accepted; scratch and rehearsal rejected;
  TEST rejected without flag and accepted with flag; PROD rejected.
- `deploy/postgres/test-strict-rls-finalizer.sql` now accepts named TEST by default and no longer accepts a disposable
  override; its separate future owner-gated PROD path remains explicit.

## Validation executed

- `node scripts/check-b0-migration-baseline.mjs` — PASS.
- `node --test scripts/check-b0-migration-baseline.audit.test.mjs` — PASS, `2/2`.
- `node scripts/check-saas-db-regression.mjs` — PASS.
- `node scripts/check-test-runner-visibility.mjs` — PASS: integrator `83/83`, webapp `323/323`, media-worker `5/5`.
- `pnpm --dir apps/webapp typecheck` — PASS.
- Pure purge-target fault matrix via `pnpm --dir apps/webapp exec tsx -e ...` — PASS, `6/6`.
- `git diff --check` — PASS.
- No DEV, TEST, PROD, env, server, worker, scheduler or external channel was touched.
