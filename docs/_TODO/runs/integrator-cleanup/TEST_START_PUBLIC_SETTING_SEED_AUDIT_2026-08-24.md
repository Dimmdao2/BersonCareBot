# TEST start public setting seed — independent audit

Date: 2026-08-24

Branch: `wt/test-start-public-settings-census-20260824`

Candidate: `efcaac2af80e7b6357d02bc474fdf6c794cc6dff`

Audited migration:
`apps/webapp/db/drizzle-migrations/20260824T162826_seed_unsupported_client_fallback_setting.sql`

Verdict: **PASS**

No blocking finding was found. The candidate is a data-only, owner-preserving seed in the single
canonical `public.system_settings` root. It closes the one reachable TEST startup gap identified by
the complete public-runtime caller census without restoring a mirror or changing TEST routing.

## Authority and test-or-view classification

The authority for this bounded audit is the worker brief plus the owner requirements that every
change has an independent audit, TEST remains at `test.bersoncare.ru`, and
`app_runtime_settings`/other mirrors must not return. Before candidate inspection or reading
existing tests, the blind kill-set was fixed as follows:

- missing canonical row creates exactly one global/admin boolean `false` row;
- existing boolean `true`, `updated_at`, and `updated_by` survive unchanged;
- rerun creates no duplicate;
- no mirror, second path, database object, role, grant, revoke, or policy appears;
- timestamp, statement marker, and VERIFY pass the standard gates; VERIFY accepts either boolean
  value while rejecting missing and malformed values;
- the migration is a data-only INSERT into the existing root and needs no runtime-rights change;
- the whole public runtime namespace and production caller graph, not only the reported key, leave
  no other reachable required TEST startup row missing.

Classification:

| Kill-set item | Classification | Independent oracle |
|---|---|---|
| 1–3 | rollback-only behavior probe | Execute the exact INSERT shape against named DEV constraints; assert state before `ROLLBACK`. |
| 4 | view + read-only catalog census | Diff and migration SQL show no DDL; TEST catalogs show no retired mirror surface. |
| 5 | standard gates + rollback-only behavior probe | Repository gates check tag/order; the exact VERIFY predicate is exercised on false, true, missing, and malformed states. |
| 6 | view + privilege gate | Written rights analysis, statement inspection, candidate diff, and the privilege checker. |
| 7 | source caller census + read-only TEST data/catalog census | Enumerate the complete public registry, trace startup callers, then compare every category with TEST. |

No existing test was used to derive the kill-set.

## Candidate diff and migration inspection

```bash
git diff --name-status efcaac2af^..efcaac2af
git diff --check efcaac2af^..efcaac2af
```

PASS. The first command reported exactly one added file, the named migration; the second command
had no output. No reader, registry, caller, route, deployment, domain, or privilege declaration is
changed by the candidate.

The migration has the required timestamp-forward filename. Its only executable statement is:

- an `INSERT` into existing `public.system_settings`;
- `key = 'patient_unsupported_client_fallback_enabled'`;
- `scope = 'admin'`, `organization_id = NULL` (the canonical global row);
- `value_json = jsonb_build_object('value', false)`;
- `updated_by = NULL` for a newly seeded value;
- `ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING`.

The conflict target exactly matches the existing partial unique index on global
`system_settings(key, scope)` in `apps/webapp/db/schema/schema.ts`. Consequently, the insert neither
duplicates the global row nor updates an existing owner value or its audit columns.

The INSERT is immediately preceded by `BCB-MIGRATION-BACKFILL`. The migration's
`BCB-MIGRATION-VERIFY` uses an `EXISTS` predicate for the same key/scope/global identity and requires
`jsonb_typeof(value_json -> 'value') = 'boolean'`; it deliberately does not require the boolean to
be `false`, so an existing owner-selected `true` passes.

## Rollback-only behavior probes on named DEV

One foreground `psql` process connected through the documented local PostgreSQL socket to the
named `bcb_webapp_dev` database:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT 'baseline_before' AS phase,
       count(*) AS rows,
       string_agg(value_json::text, ',') AS values,
       string_agg(updated_at::text, ',') AS updated_at,
       string_agg(coalesce(updated_by::text, 'NULL'), ',') AS updated_by
FROM public.system_settings
WHERE key = 'patient_unsupported_client_fallback_enabled'
  AND scope = 'admin'
  AND organization_id IS NULL;
BEGIN;
DO $probe$
DECLARE
  v_actor uuid;
  v_sentinel timestamptz := '2001-02-03 04:05:06+00';
  v_verify boolean;
BEGIN
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'probe requires one existing platform_users row';
  END IF;

  DELETE FROM public.system_settings
  WHERE key = 'patient_unsupported_client_fallback_enabled'
    AND scope = 'admin'
    AND organization_id IS NULL;

  INSERT INTO public.system_settings (
    key, scope, organization_id, value_json, updated_at, updated_by
  ) VALUES (
    'patient_unsupported_client_fallback_enabled', 'admin', NULL,
    jsonb_build_object('value', false), now(), NULL
  ) ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND value_json = '{"value": false}'::jsonb
      AND updated_by IS NULL
  ) OR (
    SELECT count(*) FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'missing->false failed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean'
  ) INTO v_verify;
  IF NOT v_verify THEN RAISE EXCEPTION 'VERIFY rejected false'; END IF;
  RAISE NOTICE 'missing->false and VERIFY(false): PASS';

  INSERT INTO public.system_settings (
    key, scope, organization_id, value_json, updated_at, updated_by
  ) VALUES (
    'patient_unsupported_client_fallback_enabled', 'admin', NULL,
    jsonb_build_object('value', false), now(), NULL
  ) ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

  IF (
    SELECT count(*) FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'rerun created duplicate';
  END IF;
  RAISE NOTICE 'rerun uniqueness: PASS';

  UPDATE public.system_settings
  SET value_json = '{"value": true}'::jsonb,
      updated_at = v_sentinel,
      updated_by = v_actor
  WHERE key = 'patient_unsupported_client_fallback_enabled'
    AND scope = 'admin'
    AND organization_id IS NULL;

  INSERT INTO public.system_settings (
    key, scope, organization_id, value_json, updated_at, updated_by
  ) VALUES (
    'patient_unsupported_client_fallback_enabled', 'admin', NULL,
    jsonb_build_object('value', false), now(), NULL
  ) ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND value_json = '{"value": true}'::jsonb
      AND updated_at = v_sentinel
      AND updated_by = v_actor
  ) THEN
    RAISE EXCEPTION 'existing true audit columns were overwritten';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean'
  ) INTO v_verify;
  IF NOT v_verify THEN RAISE EXCEPTION 'VERIFY rejected true'; END IF;
  RAISE NOTICE 'existing true + updated_at/updated_by preservation and VERIFY(true): PASS';

  DELETE FROM public.system_settings
  WHERE key = 'patient_unsupported_client_fallback_enabled'
    AND scope = 'admin'
    AND organization_id IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean'
  ) INTO v_verify;
  IF v_verify THEN RAISE EXCEPTION 'VERIFY accepted missing'; END IF;
  RAISE NOTICE 'VERIFY rejects missing: PASS';

  INSERT INTO public.system_settings (
    key, scope, organization_id, value_json, updated_at, updated_by
  ) VALUES (
    'patient_unsupported_client_fallback_enabled', 'admin', NULL,
    '{"value": "false"}'::jsonb, now(), NULL
  );
  SELECT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'patient_unsupported_client_fallback_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
      AND pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean'
  ) INTO v_verify;
  IF v_verify THEN RAISE EXCEPTION 'VERIFY accepted malformed non-boolean'; END IF;
  RAISE NOTICE 'VERIFY rejects malformed non-boolean: PASS';
END
$probe$;
ROLLBACK;
SELECT 'baseline_after_rollback' AS phase,
       count(*) AS rows,
       string_agg(value_json::text, ',') AS values,
       string_agg(updated_at::text, ',') AS updated_at,
       string_agg(coalesce(updated_by::text, 'NULL'), ',') AS updated_by
FROM public.system_settings
WHERE key = 'patient_unsupported_client_fallback_enabled'
  AND scope = 'admin'
  AND organization_id IS NULL;
SQL
```

The process recorded the baseline, opened `BEGIN`, ran fault injections and the candidate INSERT
shape, emitted assertions, executed explicit `ROLLBACK`, and then recorded the baseline again.
Every candidate INSERT in the probe was byte-equivalent in columns, values, and conflict clause to
the migration. Every VERIFY assertion used the exact predicate from the migration marker.

Output:

```text
baseline_before | 1 | {"value": true} | 2026-08-17 02:59:26.306006+03 | 00000000-0000-0000-0000-000000000003
NOTICE: missing->false and VERIFY(false): PASS
NOTICE: rerun uniqueness: PASS
NOTICE: existing true + updated_at/updated_by preservation and VERIFY(true): PASS
NOTICE: VERIFY rejects missing: PASS
NOTICE: VERIFY rejects malformed non-boolean: PASS
ROLLBACK
baseline_after_rollback | 1 | {"value": true} | 2026-08-17 02:59:26.306006+03 | 00000000-0000-0000-0000-000000000003
```

The assertions prove:

- after deleting the canonical row inside the transaction, one and only one admin/global row was
  inserted with a JSON boolean `false` and `updated_by IS NULL`;
- a second execution retained one row;
- after setting the row to boolean `true` with a sentinel timestamp and an existing actor UUID, a
  candidate rerun preserved all three values exactly;
- VERIFY accepted both false and true;
- VERIFY returned false for an absent row and for `{"value": "false"}`, whose envelope value is a
  JSON string rather than a boolean;
- the before/after baseline was byte-identical after rollback, so no fault injection persisted.

A preliminary version of the probe attempted `min(updated_by)` and failed because PostgreSQL has no
`min(uuid)` aggregate. It failed during the baseline SELECT, before `BEGIN` or any write. The
successful probe above used `string_agg(updated_by::text, ',')` and completed through explicit
rollback.

## Standard migration gates

```bash
node scripts/check-migration-privileges.mjs
```

PASS: `check-migration-privileges: OK (79 migration files)`.

```bash
bash apps/webapp/scripts/check-drizzle-migration-order.sh
```

PASS: transaction-safe migration layout and timestamp order both reported OK.

```bash
bash deploy/host/migrate-dev.sh --preflight \
  --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

PASS. The owner-aware preflight selected the candidate as the sole pending migration, installed it
in the normal owner-ordered path, ran VERIFY, and rolled the transaction back:

```text
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=78 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS for bcb_webapp_dev (transaction rolled back; no migration was applied)
```

No disposable database or historical migration replay was used.

## Written rights analysis

1. **Objects created/changed/dropped:** none. The migration changes data in one existing relation
   only. It creates no relation, view, function, trigger, index, role, grant, revoke, RLS policy, or
   other database object.
2. **DML:** one migration-time `INSERT` into `public.system_settings`, protected by the existing
   global-row partial unique index. It contains no runtime or SECURITY DEFINER body.
3. **Execution principal:** the normal migration administrator/owner used by the owner-aware
   preflight performs the INSERT. Runtime principals do not execute this statement.
4. **Runtime rights:** no new runtime privilege is needed. Existing runtime readers continue through
   the existing `app.read_public_runtime_setting` capability and do not gain direct table access.
5. **Privilege declaration:** `deploy/postgres/privileges/declaration.ts` is unchanged by
   `git diff efcaac2af^..efcaac2af`; no declaration entry is required because no runtime capability or
   object was added.
6. **Gate result:** `node scripts/check-migration-privileges.mjs` passed for all 79 migration files.

This matches the written rights analysis embedded in the migration. It also satisfies the rule that
a migration must not grant or revoke rights.

## Full public runtime caller census

### Source namespace cardinality

The following read-only Node inspection counted string literals in
`runtimeConfig.ts`, the three policy names and nine controls in `surfaceAuthSettings.ts`, and the
generated surface-key product:

```bash
node --input-type=module -e "import fs from 'node:fs'; const r=fs.readFileSync('apps/webapp/src/modules/system-settings/runtimeConfig.ts','utf8'); const s=fs.readFileSync('apps/webapp/src/modules/auth/surfaceAuthSettings.ts','utf8'); const a=(x,n)=>[...x.match(new RegExp('export const '+n+' = \\\\[([\\\\s\\\\S]*?)\\\\] as const;'))[1].matchAll(/'([^']+)'/g)].map(m=>m[1]); const b=a(r,'PUBLIC_RUNTIME_BOOLEAN_KEYS'), q=a(r,'PUBLIC_RUNTIME_STRING_KEYS'), p=a(s,'SURFACE_AUTH_POLICY_NAMES'), c=a(s,'SURFACE_AUTH_CONTROLS'), v=b.filter(k=>k.startsWith('oauth_')||k==='public_sms_fallback_enabled'), l=b.filter(k=>k.startsWith('auth_')); console.log(JSON.stringify({public_boolean_declared:b.length+p.length*c.length,legacy_boolean_literals:l.length,surface_boolean_keys:p.length*c.length,derived_on_read_boolean_literals:v.length,direct_nonlegacy_boolean_literals:b.length-l.length-v.length,public_string_declared:q.length},null,2));"
```

The successful command output was:

```json
{
  "public_boolean_declared": 43,
  "legacy_boolean_literals": 9,
  "surface_boolean_keys": 27,
  "derived_on_read_boolean_literals": 5,
  "direct_nonlegacy_boolean_literals": 2,
  "public_string_declared": 5
}
```

The two direct non-legacy booleans are `specialist_signup_enabled` and the candidate fallback key.
The five derived-on-read booleans are the four `oauth_*_enabled` projections and
`public_sms_fallback_enabled`. The five public strings are
`telegram_login_bot_username`, `max_login_bot_nickname`, `vk_web_login_url`,
`support_contact_url`, and `app_display_timezone`.

### Startup caller graph

The first search was repository code-search, followed by exact caller searches:

```bash
node /home/dev/brain/tools/code-search.mjs \
  "getUnsupportedClientFallbackEnabled public runtime setting startup AppEntryRsc login" \
  --repo bcb -k 12

rg -n \
  "AppEntryRsc|getUnsupportedClientFallbackEnabled|buildPrefetchedPublicAuthConfig|getPublicRuntime(Bool|Value)" \
  apps/webapp/src/app/app apps/webapp/src/modules/auth \
  apps/webapp/src/modules/system-settings \
  --glob '!**/*.test.*' --glob '!**/*.md'
```

The production graph is:

- `/app`, `/app/doctor/login`, and `/app/patient/login` all render
  `apps/webapp/src/app/app/AppEntryRsc.tsx`;
- `AppEntryRsc` awaits both `buildPrefetchedPublicAuthConfig()` and
  `getUnsupportedClientFallbackEnabled()` in the same startup `Promise.all`;
- the fallback reader calls the single `getPublicRuntimeBool` adapter with
  `patient_unsupported_client_fallback_enabled`;
- the prefetched auth snapshot reaches surface controls, four derived OAuth availability keys,
  specialist signup, the derived SMS fallback, and login-alternative strings;
- the public runtime adapter has one repository binding; the historical filename
  `pgAppRuntimeSettings.ts` calls the named reader for canonical `public.system_settings` and is not
  a second relation or write path.

Direct helper searches also found the remaining public string consumers for Telegram, MAX, support
contact, and display timezone. Therefore the census covers the registry surface as well as the
three reported startup routes.

### Legacy declarations

The production-source exact search was:

```bash
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/*.md' \
  "auth_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled" \
  apps/webapp/src apps/integrator/src
```

In webapp production code the nine strings occur in the runtime declaration, registry, and platform
settings API only; there is no login/startup read caller after F4. Active webapp auth reads use the
27 surface keys and the five derived values instead.

The integrator has a generic four-channel lookup map, but its production injection narrows the
callable dependency to `channel: 'telegram' | 'max'`:

```bash
rg -n "readAuthChannelPolicy\\(" apps/integrator/src \
  --glob '!**/*.test.*' --glob '!**/*.spec.*'
rg -n "'telegram'|'max'|readAuthChannelPolicy" \
  apps/integrator/src/infra/db/writePort.ts
```

The sole production injection is in `writePort.ts` and passes only Telegram or MAX. Both matching
legacy rows exist on TEST. The six absent legacy rows (`auth_email_enabled`, `auth_sms_enabled`, and
the four `auth_oauth_*_enabled` declarations) have no production caller and are not blockers, as
required by the brief.

### Read-only TEST census

The census connected to the existing named TEST database in an explicit read-only transaction; it
did not apply the candidate or alter TEST:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
BEGIN READ ONLY;
SELECT current_database() AS database, current_user AS principal;
SELECT
  count(*) AS surface_rows,
  count(*) FILTER (
    WHERE pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean'
  ) AS boolean_surface_rows
FROM public.system_settings
WHERE key ~ '^auth_surface_.*_enabled$'
  AND scope = 'admin'
  AND organization_id IS NULL;
WITH expected(category, key, expected_type) AS (
  VALUES
    ('direct_string', 'telegram_login_bot_username', 'string'),
    ('direct_string', 'max_login_bot_nickname', 'string'),
    ('direct_string', 'vk_web_login_url', 'string'),
    ('direct_string', 'support_contact_url', 'string'),
    ('direct_string', 'app_display_timezone', 'string'),
    ('direct_boolean', 'specialist_signup_enabled', 'boolean'),
    ('candidate_boolean', 'patient_unsupported_client_fallback_enabled', 'boolean'),
    ('derived_on_read', 'oauth_yandex_enabled', 'boolean'),
    ('derived_on_read', 'oauth_google_enabled', 'boolean'),
    ('derived_on_read', 'oauth_apple_enabled', 'boolean'),
    ('derived_on_read', 'oauth_vk_enabled', 'boolean'),
    ('derived_on_read', 'public_sms_fallback_enabled', 'boolean'),
    ('legacy', 'auth_email_enabled', 'boolean'),
    ('legacy', 'auth_sms_enabled', 'boolean'),
    ('legacy', 'auth_telegram_enabled', 'boolean'),
    ('legacy', 'auth_max_enabled', 'boolean'),
    ('legacy', 'auth_oauth_google_enabled', 'boolean'),
    ('legacy', 'auth_oauth_yandex_enabled', 'boolean'),
    ('legacy', 'auth_oauth_vk_enabled', 'boolean'),
    ('legacy', 'auth_oauth_apple_enabled', 'boolean'),
    ('legacy', 'auth_passkey_enabled', 'boolean')
)
SELECT e.category, e.key,
       count(s.*) AS physical_rows,
       coalesce(
         bool_and(pg_catalog.jsonb_typeof(s.value_json -> 'value') = e.expected_type),
         false
       ) AS envelope_type_ok
FROM expected e
LEFT JOIN public.system_settings s
  ON s.key = e.key
 AND s.scope = 'admin'
 AND s.organization_id IS NULL
GROUP BY e.category, e.key
ORDER BY e.category, e.key;
SELECT
  to_regclass('public.app_runtime_settings') AS app_runtime_settings,
  to_regclass('public.app_runtime_settings_audit') AS app_runtime_settings_audit,
  count(*) FILTER (
    WHERE tgname IN (
      'system_settings_mirror_to_app_runtime_settings',
      'app_runtime_settings_mirror_to_system_settings'
    )
  ) AS retired_trigger_count
FROM pg_trigger
WHERE NOT tgisinternal;
SELECT
  position('oauth_yandex_enabled' in p.prosrc) > 0 AS derives_oauth,
  position('public_sms_fallback_enabled' in p.prosrc) > 0 AS derives_sms
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app'
  AND p.proname = 'read_public_runtime_setting'
  AND pg_get_function_identity_arguments(p.oid) = 'p_key text, p_scope text';
ROLLBACK;
SQL
```

The SQL was `BEGIN READ ONLY`, a VALUES-backed expected-key join against the canonical global/admin
rows, surface/canonical-object/function catalog checks, then `ROLLBACK`. Results:

- the surface query returned `surface_rows=27` and `boolean_surface_rows=27`;
- all five direct public strings had one physical row with a JSON string envelope;
- `specialist_signup_enabled` had one physical row with a JSON boolean envelope;
- the candidate fallback had zero physical rows, matching the observed TEST failure before this
  pending migration;
- all five derived-on-read keys had zero physical rows, while the installed
  `app.read_public_runtime_setting` function body reported both OAuth and SMS derivation branches;
- legacy rows present with boolean envelopes were `auth_telegram_enabled`, `auth_max_enabled`, and
  `auth_passkey_enabled`; the six compatibility-only rows listed above were absent;
- `to_regclass('public.app_runtime_settings')` and
  `to_regclass('public.app_runtime_settings_audit')` were null, and the named retired-trigger count
  was zero;
- the transaction ended with `ROLLBACK`.

The five derived values are intentionally virtual: migrations
`20260824T150500_derive_public_sms_fallback_at_read.sql` and
`20260824T154700_derive_public_oauth_availability_at_read.sql` compute them inside the single public
reader from canonical source rows. Migration
`20260824T120000_make_system_settings_single_root.sql` removes the old mirror relations, audit
relation, mirror triggers, and mirror helpers. Inspection found no candidate path that restores any
of them.

Conclusion of the combined source/data census: after the candidate inserts the one missing fallback
row, there is no other reachable required public runtime key absent on TEST for the reported startup
routes. The six other absent declarations are legacy compatibility surface without a production
caller, not a startup dependency.

## Kill-set verdicts

| # | Verdict | Evidence |
|---|---|---|
| 1 | **PASS** | Rollback-only DEV probe created exactly one admin/global row with JSON boolean false and null `updated_by` from an absent state. |
| 2 | **PASS** | Existing true plus sentinel `updated_at` and `updated_by` survived a candidate rerun exactly. |
| 3 | **PASS** | Second execution retained one row; existing matching partial unique index enforces the invariant. |
| 4 | **PASS** | Candidate is one data INSERT; diff/catalog inspection found no mirror, second path, role, rights statement, policy, trigger, or database object. |
| 5 | **PASS** | Timestamp/order, privilege marker, and owner-aware preflight gates passed; exact VERIFY accepted false/true and rejected absent/string-valued rows. |
| 6 | **PASS** | Written analysis above: migration-owner INSERT only, no runtime-rights change, and `declaration.ts` unchanged. |
| 7 | **PASS** | Complete 43-boolean/5-string source namespace, production caller graph, and read-only TEST census leave only the candidate row missing among reachable startup dependencies. |

Overall: **PASS**.

## TEST URL and mutation boundary

The candidate does not change routes, domains, ingress, deployment configuration, or reader
architecture. It therefore preserves the existing TEST URL `test.bersoncare.ru`. This audit did not
deploy or apply the migration to TEST, so it did not claim a post-migration live HTTP observation;
the required TEST/PROD no-mutation boundary was preserved. PROD was not contacted.

The DEV owner-aware preflight and all manual fault injections rolled back. No new database was
created, no historical chain was replayed, and no migration was applied permanently.

## Permanent acceptance-test decision

No permanent acceptance test was added. The durable code shape is already covered by the migration
privilege/order gates and owner-aware preflight. The meaningful behavior oracle requires executing
the INSERT against the real partial unique index while mutating the row through several states; the
bounded rollback-only named-DEV probe supplies that evidence without leaving a test that asserts SQL
source text or requires default-suite database mutation. Product code and migration were not
changed.
