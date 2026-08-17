# B0 named-DEV DB behavior — correction report, 2026-08-17

Authority: independent FAIL at
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_INDEPENDENT_AUDIT_2026-08-17.md`.
This correction did not contact or mutate DEV, TEST, or PROD.

## Result

- Target refusal now validates every one of the four PostgreSQL URLs as exact
  `127.0.0.1:5432/bcb_webapp_dev`; integrator and webapp modes are independently exact `port-context`. Diagnostics
  contain labels and public target facts only, never URL credentials.
- Every runner HTTP request has a 30-second abort deadline and the run has a 12-minute deadline. Reversible writes
  have recovery cleanup. Patient reminder creation is disabled, carries a standard owner-scoped idempotency key,
  knows its deterministic owned rule id before the request, and deletes that id in `finally` even if the create
  response is lost. Booking and retained chat rows use one unique run tag; chat recovery asserts at most one row.
- The exact source census is 35 files / 121 top-level test declarations. The nine `RegExp.prototype.test` false
  matches are excluded. Round 2 now claims only 2 exact static replacements and 19 same-consequence READY cells;
  it leaves 85 product/worker and 9 security/catalog consequences unproved and explicitly retires 6 non-product
  implementation contracts.
- The nine security/catalog cells have one non-DB declaration/generator oracle. It proves the intended declaration,
  not installed catalog state; live catalog equality remains for canonical named-environment reconcile.
- The B0 gate kills the saved 18/18 faults plus 7/7 newly named JS DB-client, `psql -c` include, Python and
  case/spacing equivalents. It still accepts inert prose and excludes the archive.
- Round-2 re-audit invalidated the mechanical reference rewrite in this report. The 60 affected documents now
  preserve their actual historical command/result text and start with an exact non-runnable retired-path notice.
  The 86 invented `node .../RETIREMENT.md` commands were removed; the re-audit itself retains one such line only as
  truthful evidence of the failed command. Unmarked active instructions remain rejected by the executable B0 gate.

## Verification

```text
pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
PASS — 7/7 local refusal/fault tests + actual canonical env-file refusal check; no HTTP/DB request

node --test apps/webapp/scripts/named-dev-db-behavior-runner.test.mjs apps/webapp/scripts/named-dev-db-behavior-runner.audit.test.mjs
PASS — 9/9

node --test scripts/census-retired-postgres-tests.test.mjs
PASS — 2/2; measured 35 files / 121 declarations

node --test scripts/check-b0-migration-baseline.audit.test.mjs
PASS — saved 18/18 faults killed

node --test scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
PASS — additional 7/7 faults killed

node --experimental-strip-types --test deploy/postgres/privileges/retired-db-security-oracles.test.mjs
PASS — 5/5 grouped declaration/generator oracles

pnpm --dir apps/webapp exec vitest run src/modules/reminders/service.idempotency.test.ts src/modules/reminders/service.mechanicWriteClearance.test.ts src/app/api/tariffMechanics.route.test.ts
PASS — 3 files / 48 tests

pnpm --dir apps/webapp run typecheck
PASS

pnpm --dir apps/webapp run lint
PASS
```

## Remaining named blockers

- The 19 READY product consequences are not PASS until the shared live DEV audit releases the single server and the
  serialized runner records durable readbacks.
- The remaining 85 product/worker consequences require ordinary product/provider/worker state grouped in the matrix;
  no fixture root, raw SQL, disposable database or historical replay was added.
- The nine declaration/generator cells still require the canonical named-environment reconcile/catalog comparison
  before they can become live PASS.
