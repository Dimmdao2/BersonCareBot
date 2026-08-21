# Independent audit — live DEV/TEST fixture retirement

Date: 2026-08-21

Role: `auditor-live`

Verdict: **FIXTURE RETIREMENT → FAIL**

## Scope and authority

- Candidate HEAD: `1bb2a36e23d11ba4a4d69f19f8150b40d17b4dfa`.
- Current integration ref inspected: `feat/doctor-ui-rebuild` =
  `3fc2075e0f6ec714c7e3f93ce38d07941084aee1`.
- Candidate diff inspected with `git diff feat/doctor-ui-rebuild...HEAD`: 62 paths
  (`A 2`, `D 35`, `M 25`), 287 insertions and 10,163 deletions.
- Product commit: `ce5d5cccf90990b5d1629184096ed318be2482e9`.
- Canon-normalization commit:
  `dc2fdbcd023d7b69ba238dece12dd0ce952e6063`.
- Governing owner decision: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10 and the
  matching 2026-08-21 entry in `docs/OWNER_DECISIONS.md`: named DEV/TEST do not create,
  seed, reconcile, or require persistent fixture clinics, accounts, or datasets.
- Exact dated search of `docs/OWNER_DECISIONS.md`,
  `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, and the current `WORK_ORDER.md` found no
  owner text dated after 2026-08-21. No incompatible later owner decision blocks this audit.

## Findings

### F1 — MUST FIX: ordinary `dev:*` bypass still requires persistent synthetic identities, and a live writer remains

Reachable scenario:

1. `GET /api/auth/dev-bypass?token=dev%3Aclient` reaches
   `parseDevBypassToken()` in `apps/webapp/src/modules/auth/service.ts`.
2. The preset still hard-codes synthetic UUID `00000000-0000-0000-0000-000000000001`,
   phone `+79990000001`, and Telegram binding `111111111`. Seven other `dev:*` presets
   likewise hard-code fixture identities; exact preset count is 8.
3. With the normal DB-backed identity port, `exchangeIntegratorToken()` calls
   `findByChannelBinding(binding)` and returns `null` when the row is absent. It then also
   requires the stored phone to equal the preset phone through
   `devBypassPresetPhoneMatches()`.
4. The removed `deploy/postgres/dev-c2-dev-bypass-fixture.sql` explicitly documented and
   implemented those exact required rows. Removing its writer ports did not remove this
   runtime dependency.
5. `apps/webapp/scripts/seed-qa-broadcast-fake-clients.mjs` remains an executable DEV-only
   persistent writer. It inserts/updates the exact canonical `dev:client` platform user and
   its Telegram binding and says it must remain in lockstep with `parseDevBypassToken()`.

Impact: on a named DEV database that follows the owner rule and does not contain the synthetic
binding, the documented ordinary dev login silently fails. Conversely, the surviving manual
script restores precisely the persistent account/binding mechanism the owner forbade. This
violates acceptance result 2 and owner rule §10.

The active `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` is internally contradictory:
it says the presets have no dedicated persistent dataset and use existing owner accounts, but
then documents the same fixed `dev:*` token routes. No adapter maps an owner account onto those
tokens.

No existing auth behavior test exercises `exchangeIntegratorToken()` with a missing DB binding;
the two affected existing tests cover only env classification and cold DI composition. Therefore
no fault injection was performed and no source-string absence test was added.

### F2 — MUST FIX: current candidate breaks the TEST C4 deploy self-test

Command:

```text
bash deploy/host/deploy-test-saas.sh --strict-closure-catalog-self-test && bash deploy/host/deploy-test-saas.sh --c4-operational-chain-self-test
```

Result: exit 1. The strict-closure catalog self-test first prints `OK`, then the C4 chain fails:

```text
FATAL: C4 self-test artifact escaped current checkout: deploy/host/smoke-set-postgres-role-password.sh
```

`deploy/host/deploy-test-saas.sh` still assigns the removed path to
`C4_OPERATIONAL_PASSWORD_SMOKE`, resolves it as a required current-checkout artifact, and runs it
from `run_c4_operational_chain_self_test()`. The file is absent at candidate HEAD. Git history
shows it was retired by `fb44002ce`, and the latest merge into this worktree left the stale caller.

Impact: the existing no-DB deploy validation gate cannot complete. This is a concrete
integration/runtime break in the candidate and violates acceptance result 3.

### F3 — MUST FIX: conditionally active CI still requires a fixture-seeded TEST target

`.github/workflows/zap.yml` is a scheduled/manual workflow whose TEST job becomes reachable when
`vars.ZAP_ENABLED == 'true'`. Its active job name, step name, and contract require a
`synthetic/demo-fixture test target` / `test target seeded with demo fixtures`.

Impact: enabling the already-defined TEST DAST job reintroduces a CI dependency on the retired
persistent fixture state. The job is dormant while the variable is absent, but it is not archival
evidence and its enabled path is live. This violates acceptance result 1; the fixture step was not
removed from the CI contract.

## Exact backreference census

### Deleted entrypoints and former callers

The following names have zero current matches in `package.json`, `apps/**`, `deploy/**`,
`scripts/**`, `tools/**`, and `.github/**` (the exact `rg` command returned exit 1):

| Deleted entrypoint / contract | Former live caller(s) at `ce5d5cccf^` | Current status |
| --- | --- | --- |
| `seed-saas-test-walkthrough-fixtures.ts` | webapp package script; reconcile wrapper | dead |
| `patient-organization-test-lifecycle.ts` | webapp package script; U5a host wrapper | dead |
| `run-saas-isolation-test-scenarios.ts` | webapp package script | dead |
| `update-saas-product-smoke-fixture-canonical-slots.ts` | two webapp package scripts; host wrapper | dead |
| `converge-saas-smoke-login-passwords.mjs` | `deploy-test-saas.sh`; its host test | dead |
| `reconcile-saas-test-walkthrough-fixtures.sh` | host deploy README; scripts README | dead |
| `mint-smoke-session.mjs` | no external code/package caller | dead |
| `saas-test-fixture-packet.mjs` | seeder; deploy; reconcile; visual-session helper | dead |
| `validate-saas-product-smoke-fixture.sh` | canonical-slot updater; session minter | dead |
| `dev-c2-dev-bypass-fixture.sql` | manual entrypoint only | dead by exact name, but behavior survives as F1 |
| `test-owner-ready-locked-matrix.sql` | `deploy-test-saas.sh` | dead |
| `test-patient-identity-capability-gate.sql` | `deploy-test-saas.sh` | dead |
| `test-saas-isolation-telemetry-fixtures.sql` | deploy; privilege census test | dead |
| `check-owner-ready-test-integration.mjs` | root package script | dead |
| `check-saas-product-smoke-contract.mjs` | root package script | dead |
| `smoke-saas-product.mjs` | root package script; contract checker | dead |

The deleted DB-writing DI symbols (`DevBypassClinicAdminWorkspace`,
`DevBypassPlatformUserPhone`, and their lower-case/pg variants) also have zero current matches
in active code/package/deploy paths (exact `rg`: exit 1), so the deleted ports themselves leave
no direct import/DI hole.

### Surviving live or dead backreferences

| Backreference | Classification | Evidence |
| --- | --- | --- |
| Fixed `dev:*` presets → `findByChannelBinding()` → phone equality | **live / failing** | `service.ts:278-350, 573-581, 590-661` |
| `seed-qa-broadcast-fake-clients.mjs` → exact `dev:client` user and Telegram binding upsert | **live manual writer / failing** | script lines 82-179; its only textual caller is its own Usage line |
| ZAP TEST job → seeded demo-fixture target | **live when enabled / failing** | `.github/workflows/zap.yml:5,38,42,84-87` |
| `C4_OPERATIONAL_PASSWORD_SMOKE` → removed shell file | **live broken self-test / failing** | reproduced by exit 1 above |
| `devBypassDatabaseIdentityIsReadOnly` | dead production helper; test-only backrefs remain | export in `env.ts`, one env test, one cold-composition mock; no product caller |
| Historical fixture references under archive/audit/evidence/run records | archival | deliberately not counted as callers and not rewritten |

## Preserved behavior and bounded privilege removal

- `deploy/host/deploy-test.sh` still performs owner/integrator migrations, exact privilege
  reconciliation, rollback-only tenant isolation proof, restart of the five TEST units, and
  canonical API/webapp health checks. No retired fixture entrypoint is called there.
- `deploy-test-saas.sh` no longer installs the two TEST scenario functions or the three
  fixture-dependent DB gates. No hidden replacement seed/reconcile fallback was found in its
  retirement diff. F2 remains an independent stale-artifact failure.
- Privilege removal is limited to two TEST-only functions:
  `app.read_saas_isolation_test_scenario_fixture_counts()` and
  `app.set_saas_isolation_test_scenario(text)`. Relation-access removal is four declaration
  edges, all pointing to the two deleted dev-bypass DB repositories.
- Generator `--check` confirms all four generated DEV/TEST privilege/allowlist artifacts match
  their declarations byte-for-byte.
- The visual global-admin session and capture helpers pass their self-tests and use the existing
  protected owner-account packet; the deleted mint/fixture packet contract has no current caller.
- The four active owner/canon files have one consistent 2026-08-21 rule. D15b/6 and D30 remain
  explicitly open, and the HTTP ownership text remains call-path-specific. Track D was not closed.
- No migration path is added or modified in the candidate diff (`rg` exit 1). No DB was contacted,
  no deploy/migration was run, and no code path deletes fixture data or changes owner passwords as
  part of this audit.

## Commands and exit codes

| Command | Exit | Signal |
| --- | ---: | --- |
| `git diff --stat feat/doctor-ui-rebuild...HEAD` plus `git diff --name-status ...` | 0 | full candidate census: 62 paths; `A 2`, `D 35`, `M 25` |
| `node /home/dev/brain/tools/code-search.mjs "seed persistent fixture dev bypass user clinic membership phone password synthetic account" --repo bcb -k 12` | 0 | found active dev-bypass canon; index also returned stale deleted paths, which were rechecked on disk |
| Parent/current exact `git grep`/`rg` loop for 16 retired names | 0 | recorded former callers; zero current direct matches for all 16 names |
| Exact `rg` for deleted DB-writing DI symbols | 1 | zero current references |
| Exact `rg` for the 16 retired entrypoint/package/deploy names | 1 | zero current references |
| `bash -n deploy/host/deploy-test-saas.sh` | 0 | shell syntax |
| `node --check deploy/host/test-visual-global-admin-session.mjs` | 0 | changed MJS syntax |
| JSON parse of root and webapp package manifests | 0 | manifest syntax |
| `node --test deploy/host/deploy-test-full-reset.test.mjs deploy/host/migrate-dev.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs deploy/host/test-db-ownership-contract.test.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs` | 0 | 77/77 pass |
| `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check` | 0 | generated artifacts byte-identical |
| `pnpm run check:test-visual-global-admin-session` | 0 | visual session + capture self-tests pass |
| `bash deploy/host/deploy-test-saas.sh --strict-closure-catalog-self-test && bash deploy/host/deploy-test-saas.sh --c4-operational-chain-self-test` | **1** | first gate passes; C4 gate fails on missing required script (F2) |
| `pnpm install --offline --frozen-lockfile` | 0 | audit environment setup only; lockfile unchanged |
| build of `@bersoncare/db-principal`, `@bersoncare/platform-merge`, `@bersoncare/operator-db-schema`, `@bersoncare/error-tracking` | 0 | workspace prerequisites for typecheck |
| `pnpm --dir apps/webapp run typecheck` after package builds | 0 | strict webapp typecheck |
| `pnpm --dir apps/webapp exec vitest --run src/config/envDatabaseRuntime.unit.test.ts src/modules/auth/sessionColdComposition.unit.test.ts` | 0 | 2 files, 8/8 pass; no test covers missing binding behavior |
| `git diff --check` and `git diff --check feat/doctor-ui-rebuild...HEAD` | 0 | no whitespace errors before audit artifact |

The first pre-build typecheck attempt exited 2 because local workspace package outputs were absent;
after the four package builds, the identical typecheck command exited 0. Full CI was intentionally
not run per the audit brief.

## NOT DONE

- **NOT DONE:** no product fix was made for F1, F2, or F3; auditor role forbids it.
- **NOT DONE:** D15b/6, D30, and Track D were not closed.
- **NOT DONE:** no DEV/TEST/PROD access, migration, deploy, secret read, fixture creation, account
  creation, password change, or data deletion was performed.
- **NOT DONE:** no permanent negative source-string/file-absence test and no new test machinery was
  added.
- **NOT DONE:** full CI; decision remains lead-owned after the integration batch.
