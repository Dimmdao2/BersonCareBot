# Function return-shape final audit — 2026-08-17

Candidate: `3aa923b86777aeb6a555d0bdbc62a16a1c85f363`

Independent forensic authority: `31b86a12342adcf8b0e945bd32e0bbd9c8e8482e` and
`runs/orchestration/function-return-shape-forensic-20260817.json`.

## Verdict

**PASS.** The candidate closes both r5 base-type defects and the systemic `pg_proc.proretset` blind spot without a
migration, database mutation, environment change, server/deploy action, or TEST/PROD runtime action. No reachable
finding remains in the assigned surface.

The only audit change is two acceptance assertions for PostgreSQL type modifiers plus a block-comment decoy in the
existing return-shape parser test. They close a named parser fault from the audit kill-set; no product fix was made.

## Independent reconstruction

A read-only Node command imported the candidate declaration, compared every signature with the forensic machine
ledger, then independently rebuilt the latest source state from accepted B0 evidence
`2e8ffe851a404da1894cb20b5b9d27e2dd409394:deploy/postgres/generated/prod-to-target/schema-pre.sql`, ordered active
B0-forward migrations, `deploy/postgres/port-context/contract.sql`, and the TEST fixture. Result:

- ledger `384`, candidate declarations `384`, ledger mismatches `0`;
- reconstructed repo definitions `382` plus exactly two pgcrypto extension contracts;
- forms: `258` scalar, `120` `TABLE`, `4` `SETOF`, `2` scalar extensions;
- exact totals: `260` scalar and `124` set-returning;
- DEV: `382` functions / `366` definers / `123` set-returning;
- TEST: `384` functions / `368` definers / `124` set-returning;
- independently reconstructed declaration mismatches `0`.

The two r5 rows are exact:

- `app.record_current_patient_practice_completion(uuid,text,integer)` = `uuid`, set-returning;
- `app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)` = `boolean`, set-returning.

`DeclaredFunction.returnsSet` is mandatory, all database-visible rows carry an actual boolean, and validation rejects
an omitted field. There is no optional/default result-shape fallback or parallel return-shape map.

## Generated catalog verifier

A one-off inspection of `generateFunctionCensusSql` for both databases measured:

| Database | Functions | Definers | Set | Boolean `returnsSet` rows | Gap inserts | `prorettype` predicates | `proretset` predicates | Aggregate | `LIMIT 1` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bcb_webapp_dev` | 382 | 366 | 123 | 382 | 5 | 1 | 1 | 1 | 0 |
| `bersoncarebot_test` | 384 | 368 | 124 | 384 | 5 | 1 | 1 | 1 | 0 |

The five insert categories are: missing declared function, metadata (including both `prorettype` and `proretset`),
missing EXECUTE, extra EXECUTE, and undeclared managed-schema SECURITY DEFINER. They all accumulate in one temporary
primary-key gap table and are raised once through sorted `string_agg`; no category is truncated by `LIMIT 1`.

## Blind fault injection

Every temporary product mutation below was restored before final validation.

| Fault | Red evidence |
| --- | --- |
| practice base `uuid` → `record` | 384-row source comparison reported `actual=uuid/set declared=record/set` |
| rating base `boolean` → `record` | same comparison reported `actual=boolean/set declared=record/set` |
| record `TABLE` set → scalar | same comparison reported `actual=record/set declared=record/scalar` |
| scalar → set | same comparison reported `actual=boolean/scalar declared=boolean/set` |
| TEST-only set → scalar | same comparison reported the TEST-only signature while DEV rendering remained absent |
| delete `returnsSet` from a declaration | strict `tsc` raised TS2741 and `collectGaps`/source comparison both failed |
| remove type-modifier normalization | parser assertion reported `numeric(12, 4)` instead of `numeric` |
| remove `p.proretset<>e.returns_set` | bilateral SQL test failed on the missing predicate |
| reintroduce `LIMIT 1` in metadata collection | one-off bilateral aggregate checker failed for DEV and TEST |

The same parser test is green for one-/multi-column `TABLE`, `SETOF`, one-/multi-`OUT`, a quoted default containing
return syntax, line/block comment decoys, a tagged dollar body, and scalar/TABLE type modifiers.

## Foreground validation

```text
node --test deploy/postgres/privileges/*.test.mjs
→ 80 tests, 80 pass, 0 fail

node deploy/postgres/privileges/generate-cli.mjs --gaps
→ DEV gaps=0; TEST gaps=0

node deploy/postgres/privileges/generate-cli.mjs --check
→ four generated artifacts byte-identical

node deploy/postgres/privileges/generate-cli.mjs --census --db bcb_webapp_dev
node deploy/postgres/privileges/generate-cli.mjs --census --db bersoncarebot_test
→ each database: 219 ACTIVE relations / 3212 production source files

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

The full clone used a temporary symlink to the already installed main-checkout `node_modules`; it was removed after
validation. The candidate path diff is confined to privilege declaration/generator/generated artifacts, their tests,
and orchestration evidence. There are no migration, journal, env, application runtime, host-deploy, or server changes.
