# D20 · level 4 remainder — D4/D5/D6 and reminder-rule bypass

Date: 2026-08-20

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D20;
`D20_INTEGRATOR_MAP.md` §«Дыра в защите D3/D4 — поимённо»;
`D20_TESTS_LEVEL4_REPORT.md` §§D4, D5, D6, «Seventh reachable gap».

## Result

### D6 — fixed in the privilege declaration

`integrator.direct_public_write_retries` is the required local technical write.  On a failed
`reminders.rule.upsert` direct-public write, `writePort.ts` re-enters
`runWithIntegratorPrincipal(...)` before calling `enqueueDirectPublicWriteRetry`; that principal
uses `SET ROLE app_patient`.  The retry repository inserts exactly
`operation`, `organization_id`, `idempotency_key`, and `payload`, but the declaration previously
granted those columns only to `app_integrator_request`.

`deploy/postgres/privileges/declaration.ts` now grants that same exact, column-scoped `INSERT` to
`app_patient`.  It preserves the existing request and delivery-worker grants.  This is
declaration-only: no migration, generated privilege SQL, generator apply, or database was touched.

### D4 — owner question

The only real-principal proof remains opt-in:
`writeReminderRulesDirect.rls.integration.test.ts` requires a named TEST connection, signing secret,
`USE_REAL_DATABASE=1`, `RUN_REMINDER_RULES_RLS_TEST=1`, and locked principal context.  Ordinary CI
executes only `pnpm test`; the historical disposable runner is deleted and forbidden.  No sanctioned
ordinary-CI TEST credential/runner is defined in this checkout.

**Owner question:** which sanctioned CI environment and credential source may run the existing
named-TEST real-principal proof?  No CI workflow, disposable database, or second DB test harness was
invented.

### D5 — owner question

The patient support mirror still returns `{ mirrored: false }` after a warning and exposes neither
a durable outbox dependency nor an explicit refusal.  The required outcome after public DML revocation
is therefore not defined by the map or current product boundary.

**Owner question:** when the patient support write cannot reach webapp, must the path enqueue a durable
outbox item or explicitly refuse the message?  No durability/refusal behavior was guessed.

### Reminder-rule bypass — confirmed, not mechanically changed

`writePort.ts` calls `upsertReminderRuleDirect` directly for `reminders.rule.upsert`; it has no
`executeCanonicalWriteOrLegacy` call.  This is not a mechanical D1–D3 extension: the direct writer is
explicitly the D5 replacement for the former `reminder.rule.upserted` HTTP projection, and
`WebappEventsPort` has no corresponding reminder-rule canonical-write handoff contract.  Adding one
would choose ownership and failure behavior rather than reuse an accepted interface.

**Owner question:** should reminder-rule writes remain an explicit integrator-owned direct-public
projection, or should webapp own a new canonical handoff contract?  No speculative handoff or test was
added.

## Validation

```text
git diff --check
# passed

node --experimental-strip-types --input-type=module -e "import { declaration } from './deploy/postgres/privileges/declaration.ts'; for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) { const grants = declaration.databases[dbName].tables['integrator.direct_public_write_retries'].access.grants; const grant = grants.find((entry) => entry.role === 'app_patient' && entry.operations.length === 1 && entry.operations[0] === 'INSERT'); const columns = grant?.columns; if (!grant || columns === 'table' || [...columns].sort().join(',') !== 'idempotency_key,operation,organization_id,payload') throw new Error(dbName); console.log(dbName + ': app_patient INSERT ' + columns.join(',')); }"
# bcb_webapp_dev: app_patient INSERT operation,organization_id,idempotency_key,payload
# bersoncarebot_test: app_patient INSERT operation,organization_id,idempotency_key,payload

node --experimental-strip-types --test deploy/postgres/privileges/relation-access.test.mjs
# 41 passed, 0 failed

pnpm exec tsc --noEmit --strict -p deploy/postgres/privileges
# failed before this change's declaration entry at declaration.ts:6023:
# TS2322: Type 'exact UPDATE in migration 0050' is not assignable to the existing literal-union type.

pnpm exec prettier --check deploy/postgres/privileges/declaration.ts docs/_TODO/runs/integrator-cleanup/D20_LEVEL4_REMAINDER_2026-08-20.md
# failed: this checkout has no root node_modules and pnpm reports Command "prettier" not found.
```

The typecheck failure is outside the D6 entry (`declaration.ts:6691`) and was not changed here.

## NOT DONE

- D4 awaits the owner CI/credential decision.
- D5 awaits the owner durability-or-refusal decision.
- The reminder-rule ownership/handoff decision is open.
- The declaration change is not applied to any database; privilege generation/application is a separate
  gated step.
