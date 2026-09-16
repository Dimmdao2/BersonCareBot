# Independent audit: DEV migration owner metadata — 2026-08-17

## Verdict

**PASS** for candidate `2688a80e3cec3ff127f64f2b53853c2bd13dde12`.

No reachable migration/parser defect remains in the bounded `0016`/`0017` owner-metadata correction. No database,
DEV, TEST, PROD, environment, deploy or push command was run.

## Owner and object proof

- Production path: `deploy/host/migrate-dev.sh` calls `deploy/postgres/privileges/migrate-local.mjs` with
  `--drizzle-folder`; that adapter reads the active journal and executes `parseOwnerStatements` from
  `migrate-local-parse.mjs`. Both `0016` and `0017` parse as one owner-scoped statement each.
- An independent declaration-parity script parsed every `CREATE OR REPLACE FUNCTION` header from both files and
  looked up the exact normalized signature in `declaration.portContext.functions`:
  - `0016`: 11/11 functions;
  - `0017`: 36/36 functions;
  - total: 47/47 have owner `app_seam_patient_self_actions_owner`, `SECURITY DEFINER`, `VOLATILE`, and sole runtime
    execute role `app_patient`.
- Exact counts from the SQL are `create=11 attestation-owner=11` for `0016` and
  `create=36 attestation-owner=36` for `0017`: every function body calls
  `require_attested_context_for_roles('app_seam_patient_self_actions_owner', ['app_patient'])`.
- The declared owner role is a closed NOLOGIN owner: `superuser=false`, `bypassrls=false`, `inherit=false`,
  `createrole=false`, `members=[]`. This is the one correct execution owner for these current-patient self-action
  roots; using another seam owner would disagree with both the function attestation and the privilege declaration.
- The one non-create object operation is removal of
  `app.upsert_current_patient_material_rating(text,uuid,integer)`. Its creator in `0014` is the same
  `app_seam_patient_self_actions_owner`; the obsolete overload is absent from the active declaration, while the
  replacement five-argument overload is declared under that owner.
- `BCB-MIGRATION-SCHEMA-CREATE: app` and `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` are required by these PL/pgSQL
  functions and are temporary grants which `migrate-local.mjs` revokes before commit.

## Parser and journal proof

An independent journal walk asserted exactly 18 post-B0 entries, parsed every file through the production
`parseOwnerStatements`, and produced `forward=18 parsedStatements=21`. The per-entry result was one step for
`0001`–`0011`, two for `0012`, one for `0013`–`0017`, and three for unchanged `0018`.

The candidate's parser regression passed:

```text
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
4 tests, 4 pass, 0 fail
```

## Kill-set

All temporary mutations were reverted before the audit commit.

| Deliberate break | Oracle | Result |
| --- | --- | --- |
| `0016` wrong owner | production parser regression | RED, exit 1 |
| `0017` missing schema and language directives | production parser regression | RED, exit 1 |
| narrative comment before the leading owner directive | production parser regression | RED, exit 1 |
| `0017` journal entry removed | production parser regression | RED, exit 1 |
| `0018` owner changed | production parser regression | RED, exit 1 |
| non-metadata SQL body changed (`home` source literal) | normalized HEAD-vs-parent bounded-diff guard | RED, exit 1 |

The parser test intentionally remained green for the SQL-body mutation: its contract is executable owner-step
shape, not a source checksum. The independent normalized-diff guard removes only `TEMPORARY LOCAL MIGRATION
NUMBER` and `BCB-MIGRATION-*` header lines and compares the remaining SQL with the parent. It passes on the
candidate for both files (`non-metadata SQL unchanged`) and failed on the injected SQL-body mutation. A permanent
source hash was not added because AGENTS §10a forbids replacing behavior verification with source-text pinning.

## Verification

- `node --test deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS, 4/4.
- independent journal walk through production parser — PASS, 18/18 forward entries, 21 statements.
- independent SQL/declaration parity script — PASS, 47/47 functions.
- `node --experimental-strip-types --test deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs`
  — PASS, 45/45.
- `node scripts/check-b0-migration-baseline.mjs` — PASS: B0 + 18 webapp forward migrations, no legacy chain.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS, including transaction-safe layout check.
- `pnpm exec eslint deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS.
- `node --check deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS.
- `git diff --check` — PASS.
- normalized non-metadata comparison with `HEAD^` — PASS for `0016` and `0017`.

`node --test deploy/host/migrate-dev.test.mjs` remains 8/9 PASS with the pre-existing stale `d30` online-index
expectation in test 7. The current wrapper contains no `d30`/online-index call, while the test fixture and assertion
still do. This mismatch predates and is outside the bounded metadata correction; it does not exercise the owner
parser change and was not modified or hidden here.
