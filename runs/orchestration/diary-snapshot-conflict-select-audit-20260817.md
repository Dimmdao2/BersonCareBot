# Diary snapshot conflict SELECT — independent audit — 2026-08-17

## Verdict

**PASS** for candidate `7b4348931075395a8088fcc5ffa718ba4fabfe58`.

No MUST FIX finding exists in the audited surface. The change preserves the existing `INSERT` capability and adds
only the PostgreSQL read needed by the existing targeted conflict arbiter:

- function: `app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)`;
- relation: `public.patient_diary_day_snapshots`;
- added owner privilege: column-level `SELECT` on `platform_user_id`, `local_date`;
- unchanged write privilege: column-level `INSERT` on the original ten inserted columns;
- `app_patient` retains read-only direct access and reaches the write only through the named definer root.

No DB, DEV, TEST, PROD, env, deploy, push, or product-code action was performed.

## Semantic inspection

The live function body in `0016_patient_self_action_capabilities.sql` contains exactly:

```sql
ON CONFLICT (platform_user_id, local_date) DO NOTHING
```

The table primary key is exactly `(platform_user_id, local_date)`. PostgreSQL's canonical `INSERT` contract says
that every form of `ON CONFLICT` needs `SELECT` on columns read by the conflict target, and specifically that an
`index_column_name` requires `SELECT` on that column:

<https://www.postgresql.org/docs/current/sql-insert.html>

Both committed DEV/TEST privilege artifacts contain exactly one matching function-surface row with operations
`SELECT, INSERT`, exactly one narrow owner grant, and no table-wide owner `SELECT`. Both also retain the executable
function-body verifier which fails targeted `ON CONFLICT DO NOTHING` when `SELECT` is absent.

## Fault injection

All mutations were temporary and reverted before the final gates.

| Injected defect | Gate result |
| --- | --- |
| remove `SELECT` and its operation columns | exit `1`; both focused tests failed (`0 pass / 2 fail`) |
| omit `operationColumns`, widening owner `SELECT` to every surface column | exit `1`; both focused tests failed (`0 / 2`) |
| add `organization_id` to the two-key owner `SELECT` | exit `1`; both focused tests failed (`0 / 2`) |
| remove the conversion guard so direct `app_patient INSERT` resurfaces | exit `1`; named-root isolation test failed (`1 / 1` selected relevant test) |
| remove the existing function `INSERT` surface | exit `1`; exact-surface and named-root tests failed (`0 / 2`) |
| widen only the generated DEV artifact, leaving TEST canonical | `--check` exited `1`, reported exactly one DEV privilege mismatch while TEST stayed byte-equal |

The missing-`SELECT` fault also exercises the exact live-reconcile failure class: with the actual targeted conflict
body, the generated verifier sees `INSERT ... ON CONFLICT (...) DO NOTHING`; the candidate surface contains
`SELECT`, while the injected declaration is rejected before acceptance.

## Final gates

```bash
node --test deploy/postgres/privileges/*.test.mjs
```

passed `70/70` (`0` failed, `0` skipped) with the canonical dependency install temporarily linked into this
isolated clone and removed afterward.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check
```

passed byte parity for all four canonical artifacts: DEV/TEST privileges and DEV/TEST org allowlists.

The census was run per database to stay within host memory:

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census --db bcb_webapp_dev
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census --db bersoncarebot_test
```

Each passed `219 ACTIVE relations across 3212 source files`.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps --db bcb_webapp_dev
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps --db bersoncarebot_test
```

Each reported `gaps=0`.

```bash
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs
git diff --check
```

All exited `0`.
