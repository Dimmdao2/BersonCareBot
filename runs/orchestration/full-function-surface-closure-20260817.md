# Full function-body surface closure — 2026-08-17

## Scope and authority

- Base: `46347c4a5`.
- Independent forensic authority: `1ddd78b443e4398fba3cc5131aed03412a993841` (base ledger commit `55ea2f7290047caafddb5b57b45cd8a36227d90a`).
- The forensic pass reconstructed function bodies read-only from the accepted pre-B0 schema snapshot, overlaid only the active B0-forward migrations and contract fixtures, and never executed historical migrations.
- No database, runtime, deploy, environment, migration or journal mutation was performed.

## Classification and closure

The independent command

```bash
node --experimental-strip-types runs/orchestration/full-function-surface-forensic-20260817.mjs \
  --output runs/orchestration/full-function-surface-forensic-20260817.json
```

on the forensic commit reported `384` declared functions: `368` definers, `16` invokers, `382` reconstructed bodies, `2` expected external bodies (`app_ext.digest`, `app_ext.hmac`), `6` underdeclared definer relation-operation triples, and `27` overdeclared triples.

The six real missing triples were closed exactly:

1. reminder cancellation → `public.reminder_rules:SELECT`;
2. patient entitlements → `public.saas_paid_period_policy:SELECT` in both databases;
3. patient booking creation → `public.be_appointments:SELECT` for `RETURNING`;
4. FIO update → `public.platform_users:SELECT` on the three predicate columns;
5. FIO update → `public.user_identity:SELECT` on `platform_user_id`;
6. staff transcode enqueue → `public.media_files:SELECT`, plus the exact core delegate.

The 27 stale triples were removed without widening a replacement path:

- `23`: five zero-direct wrappers now name only their exact delegated root (`1` email + `22` password triples);
- `1`: `provision_specialist_owner` no longer claims a direct `be_organizations:SELECT`;
- `3`: archive queues retain `SELECT+DELETE`, not nonexistent `UPDATE`.

`start_provisioned_organization_trial` deliberately retains `saas_organization_trials:SELECT+INSERT`; the corrected forensic tokenizer proved the targeted conflict/returning semantics. The original runtime report's other `12` lines were six `SECURITY INVOKER` trigger bodies. They are caller-context dependencies, not owner-grant surfaces, so the generated body/owner verifier now audits only `SECURITY DEFINER` functions.

The following comparison was run against the fixed independent JSON ledger:

```bash
node --experimental-strip-types --input-type=module - <<'NODE'
import fs from 'node:fs';
import { declaration } from './deploy/postgres/privileges/declaration.ts';
const audit = JSON.parse(fs.readFileSync('/tmp/full-function-surface-forensic-20260817.json', 'utf8'));
const actualBySignature = new Map(audit.functions.map((fn) => [fn.signature, fn]));
const special = new Set(audit.specialContractRequirements.map((row) => row.signature));
const result = {};
for (const dbName of Object.keys(declaration.databases)) {
  let definers = 0; let ordinaryAudited = 0; let under = 0; let over = 0; let missing = 0;
  for (const [signature, fn] of Object.entries(declaration.portContext.functions)) {
    if (fn.security !== 'DEFINER' || (fn.databases && !fn.databases.includes(dbName))) continue;
    definers += 1;
    if (special.has(signature)) continue;
    ordinaryAudited += 1;
    const body = actualBySignature.get(signature);
    if (!body) { missing += 1; continue; }
    const actual = new Set(body.actual.flatMap((surface) => surface.operations
      .map((operation) => `${surface.relation}|${operation}`)));
    const declared = new Set((fn.relationSurfaces ?? []).flatMap((surface) => surface.operations
      .map((operation) => `${surface.relation}|${operation}`)));
    for (const triple of actual) if (!declared.has(triple)) under += 1;
    for (const triple of declared) if (!actual.has(triple)) over += 1;
  }
  result[dbName] = { definers, ordinaryAudited, specialContracts: definers - ordinaryAudited,
    under, over, missing };
}
console.log(JSON.stringify(result, null, 2));
NODE
```

Result: TEST `368` definers = `360` ordinary + `8` special, `under=0 over=0 missing=0`; DEV `366` = `358` ordinary + `8` special, `under=0 over=0 missing=0`.

## Permanent gates

- The active B0-forward artifact parser now takes the latest definition of every function and checks all four relation operations across `app`, `app_ext`, `integrator`, and `public`.
- Comment removal preserves `--` and `/* ... */` inside SQL literals; a regression fixture covers the forensic false-positive class.
- Generated runtime SQL scans all managed schemas, aggregates every finding, handles `PERFORM`, `RETURN QUERY`/CTE reads, `UPDATE ... FROM`, `DELETE ... USING`, conflict/returning reads, and fails for both missing and stale operation declarations.
- The exact production body-verifier universe is `366` DEV / `368` TEST definers; INVOKER triggers remain in the separate exact function census.
- Eight functions use non-ACL relation contracts and cannot become a generic bypass. The allowlist is closed and mutation-tested: seven transaction-context primitives are governed by `deploy/postgres/port-context/contract.sql` and its private-relation verifier; `app_control.enforce_relation_birth_wall()` is governed by the generated exact `relation_wall_registry` seed/owner policy and catalog closure. Adding the marker to any other function makes `collectGaps` fail.

## Validation

- `node --test deploy/postgres/privileges/*.test.mjs` → `77/77` pass.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps` → `gaps=0` for both databases.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check` → four generated artifacts byte-identical.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census` → `219 ACTIVE` relations across `3212` production source files in each database.
- `pnpm exec tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions deploy/postgres/privileges/types.ts deploy/postgres/privileges/declaration.ts` → exit `0`.
- `pnpm exec eslint deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/types.ts deploy/postgres/privileges/function-body-surface.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/generate.mjs` → exit `0`.
- `node scripts/check-no-new-raw-sql.mjs` → production debt `0`.
- `git diff --check` → exit `0`.
- `git diff --name-only | rg '(^|/)(drizzle-migrations|migrations|journal|env)(/|$)|\\.env'` → no matches.
