# Diary snapshot targeted-conflict SELECT fix — 2026-08-17

## Result

`app.capture_current_patient_diary_day_snapshot(...)` now declares the PostgreSQL read required by
`ON CONFLICT (platform_user_id, local_date) DO NOTHING` without widening any patient runtime write:

- the existing `INSERT` surface is unchanged;
- the named owner receives `SELECT` on exactly `platform_user_id` and `local_date`;
- `app_patient` still has zero direct mutation operations in DEV and TEST;
- the migration/function body was not changed;
- no database, DEV, TEST, PROD, env, deploy, or push action was performed.

Both canonical privilege SQL artifacts were regenerated. Their only semantic change is the function-census
surface changing from `INSERT` to `SELECT, INSERT` plus the exact column grant:

```sql
GRANT SELECT ("local_date", "platform_user_id")
ON TABLE "public"."patient_diary_day_snapshots"
TO "app_seam_patient_self_actions_owner";
```

## Acceptance

Fault injection: temporarily removing the new `SELECT` operation and its operation-specific columns, then running

```bash
node --test deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs
```

returned exit `1` with both named checks red:

- `targeted diary snapshot conflict declares only its two-key SELECT surface`;
- `ON CONFLICT seams grant SELECT only on their exact arbiter columns`.

After restoring the production declaration:

```bash
node --test deploy/postgres/privileges/*.test.mjs
```

passed `70/70` tests.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check
```

passed byte parity for all four canonical artifacts: DEV/TEST privileges and DEV/TEST org allowlists.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census
```

passed both databases: `219 ACTIVE relations across 3212 source files` for each.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps
```

reported `gaps=0` for DEV and TEST.

The exact declaration query over direct `app_patient` grants was:

```bash
node --experimental-strip-types --input-type=module <<'JS'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
  const rows = Object.entries(declaration.databases[dbName].tables).flatMap(([relation, table]) => {
    if (table.access?.kind !== 'direct') return [];
    return table.access.grants.filter((grant) => grant.role === 'app_patient')
      .flatMap((grant) => grant.operations.filter((operation) => operation !== 'SELECT')
        .map((operation) => `${relation}:${operation}`));
  });
  console.log(`${dbName} app_patient_direct_mutation_count=${rows.length}`);
}
JS
```

It reported:

```text
bcb_webapp_dev app_patient_direct_mutation_count=0
bersoncarebot_test app_patient_direct_mutation_count=0
```

Additional gates:

```bash
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs
git diff --check
```

all exited `0`. The isolated clone initially had no dependency path; a temporary symlink to the existing canonical
install was used only for typecheck/lint and the dependency-bearing catalog test, then removed before staging.
