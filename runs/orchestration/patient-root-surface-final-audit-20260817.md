# Patient root surface final audit — 2026-08-17

Status: **PASS**. Audited product SHA: `c77a799c46489f5a781200005d24134b0c985b64`.
Independent base forensic SHA: `5c46a51aa`.

## Binary result

The independent forensic program from `5c46a51aa`, executed against the candidate declaration and the unchanged
0016/0017 bodies, reports:

- `functions=47`;
- `absentRelationPairs=0`, down from 14;
- `missingOperationTriples=0`, down from 15;
- `overdeclaredRelationPairs=0`, down from 127;
- `overdeclaredOperationTriples=0`, down from 333;
- `unresolvedMentions=0`;
- all 87 required relation-operation pairs are declared for the selected roots and none is declared beyond their
  bodies.

The implementation therefore closes all 29 under-declared triples and removes the complete independently measured
per-function copied-union overbreadth. I found no reachable product, privilege, generated-artifact, or scope
violation.

## Blind kill-set and mutation evidence

The kill-set was fixed before reading the candidate tests: missing declaration identity; absent relation; missing
`SELECT`/`INSERT`/`UPDATE`/`DELETE`; overbroad relation/operation; comma-separated `FROM`; `JOIN`/`USING`;
`RETURNING *`; targeted versus targetless `ON CONFLICT DO NOTHING`; generated drift in only one database.

- I temporarily removed `org_enrollments:SELECT` and changed `reminder_rules` from `SELECT,INSERT` to
  `INSERT,UPDATE` for `create_current_patient_reminder_rule`. The exact-47 test turned red and reported both the
  absent relation and the combined missing-SELECT/overbroad-UPDATE mismatch. The mutation was reverted.
- A direct parser probe classified comma-`FROM`, `JOIN`, and `USING` as `SELECT`; `RETURNING *` as
  `SELECT,INSERT`; targeted conflict as `SELECT,INSERT`; targetless conflict as only `INSERT`; update/delete
  predicates as `SELECT` plus their mutation operation. A missing declaration identity returned the named
  `found 0` gap.
- I appended a DEV-only marker to `privileges.bcb_webapp_dev.sql`. `node
  deploy/postgres/privileges/generate-cli.mjs --check` exited red, named only the DEV privileges artifact and the
  exact drift line, while both TEST artifacts remained byte-identical. The mutation was reverted and the final
  check passed.
- The generated PostgreSQL verifier routes every surface-gap branch into one accumulator: `rg 'INSERT INTO
  bcb_function_surface_gaps' deploy/postgres/privileges/generate.mjs | wc -l` returned `13`; `rg "RAISE EXCEPTION
  'function body surface gaps" deploy/postgres/privileges/generate.mjs | wc -l` returned `1`. Missing functions,
  absent relations, all four direct operations, conflict semantics, predicates, and `RETURNING *` therefore reach
  the single sorted final exception instead of failing on the first gap.

## Validation

- `node --test deploy/postgres/privileges/function-census.test.mjs` — 9/9 pass.
- `node --test deploy/postgres/privileges/*.test.mjs` — 72/72 pass.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — all four privilege/allowlist artifacts
  byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only` — both port-context artifacts
  byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --gaps` — DEV 0, TEST 0.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — both databases: 219 ACTIVE relations across 3212
  production source files.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` — pass.
- `./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts
  deploy/postgres/privileges/function-body-surface.mjs deploy/postgres/privileges/function-census.test.mjs
  deploy/postgres/privileges/generate.mjs deploy/postgres/privileges/relation-access.test.mjs` — pass.
- `rg '^GRANT .*\\b(INSERT|UPDATE|DELETE|TRUNCATE)\\b.* TO "app_patient";'
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l` — 0; the identical TEST command — 0.
- `git diff c77a799c^ c77a799c --name-only | rg
  '(^|/)(drizzle-migrations|migrations|meta|journal|\\.env)(/|$)' | wc -l` — 0.
- `git diff --check` — pass.

The temporary dependency symlink used for TypeScript/ESLint and all product fault injections were removed. No
database, env, deploy, push, historical/A0, or disposable-migration action was performed.
