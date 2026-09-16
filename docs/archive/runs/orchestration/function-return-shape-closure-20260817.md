# Function return-shape systemic closure — 2026-08-17

Base: `a74ee1c6b5365594441f453b42791cc03070a835`

Branch: `wt/function-return-shape-closure-20260817`

## Result

The function declaration and generated bilateral catalog verifier now carry the complete PostgreSQL result shape:
`format_type(pg_proc.prorettype, NULL)` **and** `pg_proc.proretset`. The two wrong base types exposed by r5 were
corrected from the active B0-forward definitions:

- `app.record_current_patient_practice_completion(uuid,text,integer)` → `uuid`, set-returning;
- `app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)` → `boolean`, set-returning.

`returnsSet` is mandatory directly on every existing declaration row; there is no second 384-row return-shape map
and no default that can silently classify a new function as scalar. The catalog verifier records all missing,
metadata, EXECUTE and undeclared-definer mismatches in one temporary gap table and raises one sorted aggregate instead
of stopping at the first signature.

No migration, journal, product runtime code, database, env, server, deploy, TEST/PROD state, or push was touched.

## Independent source gate

`deploy/postgres/privileges/function-return-shape.mjs` parses PostgreSQL return forms independently of the generator.
The gate reconstructs the accepted B0 definition evidence, overlays active B0-forward definitions in order, then
overlays the port-context contract and TEST fixture. Two external pgcrypto contracts are explicit.

Command embedded in `function-census.test.mjs` measured:

- `382` reconstructed repo definitions + `2` explicit extension contracts = `384/384` declared functions;
- `258` scalar definitions + `120` `RETURNS TABLE` + `4` `RETURNS SETOF` + `2` scalar extensions;
- exact catalog shape: `260` scalar and `124` set-returning;
- DEV universe: `382` functions / `366` definers / `123` set-returning;
- TEST universe: `384` functions / `368` definers / `124` set-returning.

The parser probe covers one/multi-column `TABLE`, `SETOF`, one/multi `OUT`, scalar, comments, quoted defaults,
tagged dollar bodies, type aliases and modifiers. Fault injections prove red detection for both r5 base-type defects,
record TABLE → scalar, scalar → SETOF, a missing `returnsSet`, and one-DB-only drift.

## Validation

```text
node --test deploy/postgres/privileges/*.test.mjs
→ 80 tests, 80 pass, 0 fail

node deploy/postgres/privileges/generate-cli.mjs --gaps
→ bcb_webapp_dev gaps=0; bersoncarebot_test gaps=0

node deploy/postgres/privileges/generate-cli.mjs --check
→ four generated artifacts byte-identical

node deploy/postgres/privileges/generate-cli.mjs --census
→ DEV 219 ACTIVE / 3212 source files; TEST 219 ACTIVE / 3212 source files

./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
→ exit 0

./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts \
  deploy/postgres/privileges/function-census.ts \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/function-return-shape.mjs \
  deploy/postgres/privileges/generate.mjs deploy/postgres/privileges/types.ts
→ exit 0

node scripts/check-no-new-raw-sql.mjs
→ OK; production debt: 0

git diff --check
→ exit 0
```

The full clone temporarily linked the already-installed main-checkout `node_modules` only to run validation; the
link was removed before staging.
