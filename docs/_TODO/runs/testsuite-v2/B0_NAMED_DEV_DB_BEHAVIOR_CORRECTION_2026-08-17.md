# B0 named-DEV DB behavior — correction report, 2026-08-17

Authority: independent FAIL at
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_INDEPENDENT_AUDIT_2026-08-17.md` and combined audit one
`286e735e73d4fef47d7a011fb0489729dc644226` / `docs/REPORTS/B0_NAMED_DEV_DB_COMBINED_AUDIT_ONE_2026-08-17.md`.
This correction did not contact or mutate DEV, TEST, or PROD.

## Result

- Target refusal parses every one of the four PostgreSQL URLs through the same `pg.Client` connection semantics as
  runtime and accepts only effective `127.0.0.1:5432/bcb_webapp_dev` targets with no connection-parameter override;
  integrator and webapp modes are independently exact `port-context`. Diagnostics contain labels and public target
  facts only, never URL credentials.
- Every runner HTTP request has a 30-second abort deadline and the run has a 12-minute deadline. Reversible writes
  have recovery cleanup. Patient reminder creation is disabled, carries a standard owner-scoped idempotency key,
  knows its deterministic owned rule id before the request, and deletes that id in `finally` even if the create
  response is lost. Booking and retained chat rows use one unique run tag; chat recovery asserts at most one row.
- The audited current-port reminder step is part of that one canonical command, not a second live entrypoint. It uses
  the authenticated clinic overview's organization, refuses every non-canonical DB target, has a two-minute child
  deadline, performs rollback-only fault evidence, and leaves no occurrence fixture.
- The exact source census is 35 files / 121 top-level test declarations. The nine `RegExp.prototype.test` false
  matches are excluded. Combined audit one removed two SQL-source claims and two incomplete working-hours claims:
  the registry now computes 3 exact static replacements and 20 same-consequence READY cells; it leaves 83
  product/worker and 9 security/catalog consequences unproved and
  explicitly retires 6 non-product
  implementation contracts.
- The nine security/catalog cells have one non-DB declaration/generator oracle. It proves the intended declaration,
  not installed catalog state; live catalog equality remains for canonical named-environment reconcile.
- The B0 gate kills the saved 18/18 faults, the prior 7/7 variants and all six semantic bypasses from combined audit
  one: variable child executables, shell variables, Python `os.system`, Dockerfile `FROM`, piped `printf \\i` and
  concatenated client DDL. It still accepts inert prose and excludes the archive.
- Round-2 re-audit invalidated the mechanical reference rewrite in this report. The 60 affected documents now
  preserve their actual historical command/result text and start with an exact non-runnable retired-path notice.
  The 86 invented `node .../RETIREMENT.md` commands were removed; the re-audit itself retains one such line only as
  truthful evidence of the failed command. Unmarked active instructions remain rejected by the executable B0 gate.

## Verification

```text
pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
PASS — HTTP runner + target-refusal audit 11/11 + current-port step 4/4 + actual canonical env-file refusal check; no HTTP/DB request

node --test apps/webapp/scripts/named-dev-db-behavior-runner.test.mjs apps/webapp/scripts/named-dev-db-behavior-runner.audit.test.mjs
PASS — 11/11

node --test scripts/census-retired-postgres-tests.test.mjs
PASS — 2/2; measured 35 files / 121 declarations

node --test scripts/check-b0-migration-baseline.audit.test.mjs scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
PASS — 14/14 subtests; saved 18 faults, prior 7 variants and all 6 combined-audit semantic bypasses killed

node --experimental-strip-types --test deploy/postgres/privileges/retired-db-security-oracles.test.mjs
PASS — 5/5 grouped declaration/generator oracles

node --experimental-strip-types --test deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
PASS — 2/2 current declaration oracles; the forbidden SQL-source boundary test was removed

pnpm --dir apps/webapp exec vitest run src/modules/reminders/service.idempotency.test.ts src/modules/reminders/service.mechanicWriteClearance.test.ts src/app/api/tariffMechanics.route.test.ts
PASS — 3 files / 48 tests

pnpm typecheck
PASS — all seven selected workspaces

pnpm lint
PASS — root + webapp lint and executable gates

node scripts/check-retired-db-consequence-inventory.mjs
PASS — 123 paths; product=121: static=3, security=9, named-DEV-READY=20, required=83, retired=6
```

## Remaining named blockers

- The 20 READY product consequences are not PASS until the shared live DEV audit releases the single server and the
  serialized runner records durable readbacks.
- The remaining 83 product/worker consequences require ordinary product/provider/worker state grouped in the matrix;
  no fixture root, raw SQL, disposable database or historical replay was added.
- The nine declaration/generator cells still require the canonical named-environment reconcile/catalog comparison
  before they can become live PASS.
