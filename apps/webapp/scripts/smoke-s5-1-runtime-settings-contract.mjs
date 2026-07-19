#!/usr/bin/env node
/**
 * S5-1 disposable migration proof.
 *
 * This owns a PostgreSQL 16 cluster under /tmp and never reads application
 * environment variables or connects to DEV, TEST, or PROD. Output is purposely
 * aggregate-only: fixtures include secret-shaped fields only to prove that the
 * migration never copies them to either runtime data or runtime audit history.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_s5_1_runtime_settings_scratch_${stamp}_`);
const data = path.join(dir, "data");
const socket = path.join(dir, "socket");
const log = path.join(dir, "postgres.log");
const db = `bcb_s5_1_runtime_settings_scratch_${stamp}`;
const actor = "10000000-0000-4000-8000-000000000001";
const organization = "20000000-0000-4000-8000-000000000001";
const defaultedRuntimeKey = "doctor_specialist_task_reminder_channels";
const safeEnv = { LANG: "C", LC_ALL: "C", PATH: "/usr/lib/postgresql/16/bin:/usr/bin:/bin" };
let serverStarted = false;

function fail(label) {
  throw new Error(`S5-1 disposable proof failed: ${label}`);
}

function run(command, args, input, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: safeEnv,
    input,
  });
  if (result.error || result.status !== 0) fail(label);
  return result.stdout;
}

function sql(text, label = "private SQL assertion") {
  return run(
    path.join(pgBin, "psql"),
    ["-X", "-qAt", "-h", socket, "-p", port, "-v", "ON_ERROR_STOP=1", "-d", db],
    text,
    label,
  );
}

function sqlMustFail(text, label) {
  const result = spawnSync(
    path.join(pgBin, "psql"),
    ["-X", "-qAt", "-h", socket, "-p", port, "-v", "ON_ERROR_STOP=1", "-d", db],
    { cwd: root, encoding: "utf8", env: safeEnv, input: text },
  );
  if (result.status === 0) fail(label);
}

function assertSqlTrue(text, label) {
  const result = sql(text, label).trim();
  if (result !== "1" && result !== "t") fail(label);
}

function apply(relativePath, label) {
  sql(readFileSync(path.join(root, relativePath), "utf8"), label);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function reservePrivatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") fail("could not reserve a private PostgreSQL port");
  const { port: reservedPort } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return String(reservedPort);
}

function runtimeDefinitions() {
  const migration = readFileSync(
    path.join(root, "apps/webapp/db/drizzle-migrations/0209_s5_runtime_settings_audit_contract.sql"),
    "utf8",
  );
  const block = migration.match(
    /WITH runtime_definitions\(key, scope, audience, default_value_json\) AS \(\n  VALUES([\s\S]*?)\n\)\n,\nsource_rows AS/,
  )?.[1];
  if (!block) fail("could not locate the 0209 normal runtime definition block");
  const definitions = [...block.matchAll(/\('([^']+)', '([^']+)', '([^']+)',/g)];
  if (definitions.length === 0) fail("0209 normal runtime definition block is empty");
  return definitions.map(([, key, scope]) => ({ key, scope }));
}

function installMinimalPredecessorAndFixture() {
  sql(`
    CREATE EXTENSION pgcrypto;
    CREATE TABLE public.be_organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.platform_users (id uuid PRIMARY KEY);
    CREATE TABLE public.system_settings (
      key text NOT NULL,
      scope text NOT NULL,
      organization_id uuid,
      value_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid
    );
    CREATE UNIQUE INDEX system_settings_global_key_scope_uidx
      ON public.system_settings (key, scope) WHERE organization_id IS NULL;
    CREATE UNIQUE INDEX system_settings_org_key_scope_uidx
      ON public.system_settings (key, scope, organization_id) WHERE organization_id IS NOT NULL;
    INSERT INTO public.be_organizations VALUES ('${organization}');
    INSERT INTO public.platform_users VALUES ('${actor}');
  `, "minimal S5-1 fixture schema");
  apply("apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql", "0186 minimal runtime root");

  const normalDefinitions = runtimeDefinitions().filter(
    ({ key }) => key !== "patient_booking_url" && key !== defaultedRuntimeKey,
  );
  const normalRows = normalDefinitions.map(({ key, scope }) =>
    `(${sqlLiteral(key)}, ${sqlLiteral(scope)}, NULL, '{"value":"fixture"}'::jsonb, '2026-01-01T00:00:00Z'::timestamptz, '${actor}')`,
  );
  sql(`
    INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
    VALUES ${normalRows.join(",\n")};
    INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by) VALUES
      ('patient_program_discussion_ui_enabled', 'admin', '${organization}', '{"value":"fixture-org"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('web_push_vapid', 'admin', NULL, '{"value":{"publicKey":"fixture-public-key","privateKey":"fixture-private-key"}}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('booking_payment_providers', 'admin', NULL, '{"value":{"enabled":true,"defaultProviderId":"fixture-provider","providers":[{"id":"fixture-provider","label":"Fixture provider","enabled":true,"privateKey":"fixture-private-key","password":"fixture-password","apiKey":"fixture-api-key","webhookSecret":"fixture-webhook-secret","refreshToken":"fixture-refresh-token"}]}}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('yandex_oauth_client_id', 'admin', NULL, '{"value":"fixture-id"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('yandex_oauth_client_secret', 'admin', NULL, '{"value":"fixture-secret"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('yandex_oauth_redirect_uri', 'admin', NULL, '{"value":"https://fixture.invalid/yandex"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('google_client_id', 'admin', NULL, '{"value":"fixture-id"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('google_client_secret', 'admin', NULL, '{"value":"fixture-secret"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('google_oauth_login_redirect_uri', 'admin', NULL, '{"value":"https://fixture.invalid/google"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('apple_oauth_client_id', 'admin', NULL, '{"value":"fixture-id"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('apple_oauth_redirect_uri', 'admin', NULL, '{"value":"https://fixture.invalid/apple"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('apple_oauth_team_id', 'admin', NULL, '{"value":"fixture-team"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('apple_oauth_key_id', 'admin', NULL, '{"value":"fixture-key"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('apple_oauth_private_key', 'admin', NULL, '{"value":"fixture-private-key"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('sms_fallback_enabled', 'doctor', NULL, '{"value":true}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('max_bot_api_key', 'admin', NULL, '{"value":"fixture-api-key"}'::jsonb, '2026-01-01T00:00:00Z', '${actor}'),
      ('test_account_identifiers', 'admin', NULL, '{"value":{"testIdentifier":"fixture-test-identifier"}}'::jsonb, '2026-01-01T00:00:00Z', '${actor}');
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES
      ('debug_forward_to_admin', 'admin', NULL, 'server', '{"value":"destination-newer"}'::jsonb, '2026-01-02T00:00:00Z', '${actor}');
  `, "S5-1 synthetic source fixture");
  return normalDefinitions;
}

function assertSchemaContract() {
  assertSqlTrue(`
    SELECT (SELECT count(*) FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'app_runtime_settings_audit') = 10
       AND (SELECT count(*) FROM pg_constraint
              WHERE conrelid = 'public.app_runtime_settings_audit'::regclass
                AND conname IN (
                  'app_runtime_settings_audit_organization_id_fkey',
                  'app_runtime_settings_audit_updated_by_fkey',
                  'app_runtime_settings_audit_scope_check',
                  'app_runtime_settings_audit_audience_check'
                )) = 4
       AND (SELECT confdeltype FROM pg_constraint
              WHERE conrelid = 'public.app_runtime_settings_audit'::regclass
                AND conname = 'app_runtime_settings_audit_organization_id_fkey') = 'c'
       AND (SELECT confdeltype FROM pg_constraint
              WHERE conrelid = 'public.app_runtime_settings_audit'::regclass
                AND conname = 'app_runtime_settings_audit_updated_by_fkey') = 'n'
       AND (SELECT count(*) FROM pg_indexes
              WHERE schemaname = 'public' AND tablename = 'app_runtime_settings_audit'
                AND indexname IN (
                  'app_runtime_settings_audit_global_key_history_idx',
                  'app_runtime_settings_audit_org_key_history_idx'
                )) = 2
       AND (SELECT count(*) FROM pg_trigger
              WHERE tgrelid = 'public.app_runtime_settings'::regclass
                AND NOT tgisinternal) = 1
       AND (SELECT count(*) FROM pg_trigger
              WHERE tgrelid = 'public.app_runtime_settings'::regclass
                AND tgname = 'app_runtime_settings_audit_change'
                AND NOT tgisinternal) = 1
       AND (SELECT pg_get_triggerdef(oid) LIKE '%AFTER INSERT OR UPDATE%'
              FROM pg_trigger
              WHERE tgrelid = 'public.app_runtime_settings'::regclass
                AND tgname = 'app_runtime_settings_audit_change')
  `, "schema, checks, FKs, indexes, and single audit trigger");
  sqlMustFail(
    "INSERT INTO public.app_runtime_settings (key, scope, audience, value_json) VALUES ('invalid-scope', 'invalid', 'public', '{}'::jsonb);",
    "scope check rejects an invalid structural enum",
  );
  sqlMustFail(
    "INSERT INTO public.app_runtime_settings (key, scope, audience, value_json) VALUES ('invalid-audience', 'admin', 'invalid', '{}'::jsonb);",
    "audience check rejects an invalid structural enum",
  );
}

function assertBackfillContract(normalDefinitions) {
  const keys = normalDefinitions.map(({ key }) => sqlLiteral(key)).join(", ");
  assertSqlTrue(`
    WITH expected_keys(key) AS (SELECT unnest(ARRAY[${keys}]::text[])),
    source_counts AS (
      SELECT key, count(*) AS value FROM public.system_settings
      WHERE key IN (SELECT key FROM expected_keys) GROUP BY key
    ), destination_counts AS (
      SELECT key, count(*) AS value FROM public.app_runtime_settings
      WHERE key IN (SELECT key FROM expected_keys) GROUP BY key
    )
    SELECT NOT EXISTS (
      SELECT 1 FROM expected_keys
      LEFT JOIN source_counts USING (key)
      LEFT JOIN destination_counts USING (key)
      WHERE COALESCE(source_counts.value, 0) <> COALESCE(destination_counts.value, 0)
    )
  `, "source and destination aggregate counts match by legacy-backed normal runtime key");
  assertSqlTrue(`
    SELECT NOT EXISTS (
             SELECT 1 FROM public.system_settings
             WHERE key = '${defaultedRuntimeKey}' AND scope = 'doctor' AND organization_id IS NULL
           )
       AND audience = 'server'
       AND value_json = '{"value":{"channels":[]}}'::jsonb
    FROM public.app_runtime_settings
    WHERE key = '${defaultedRuntimeKey}' AND scope = 'doctor' AND organization_id IS NULL
  `, "missing legacy runtime key is created with its exact registry default and audience");
  assertSqlTrue(`
    SELECT value_json = '{"value":"destination-newer"}'::jsonb
    FROM public.app_runtime_settings
    WHERE key = 'debug_forward_to_admin' AND scope = 'admin' AND organization_id IS NULL
  `, "a newer destination row is not overwritten");
  assertSqlTrue(`
    SELECT NOT EXISTS (
      SELECT 1 FROM public.app_runtime_settings
      WHERE key IN (
        'max_bot_api_key', 'test_account_identifiers', 'web_push_vapid',
        'booking_payment_providers', 'yandex_oauth_client_secret',
        'google_client_secret', 'apple_oauth_private_key'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.app_runtime_settings_audit
      WHERE key IN (
        'max_bot_api_key', 'test_account_identifiers', 'web_push_vapid',
        'booking_payment_providers', 'yandex_oauth_client_secret',
        'google_client_secret', 'apple_oauth_private_key'
      )
    )
  `, "restricted source keys are absent from runtime data and audit");
  assertSqlTrue(`
    WITH RECURSIVE nodes(kind, node) AS (
      SELECT 'runtime'::text, value_json FROM public.app_runtime_settings
      UNION ALL
      SELECT 'audit'::text, new_value_json FROM public.app_runtime_settings_audit
      UNION ALL
      SELECT nodes.kind, child.value
      FROM nodes
      CROSS JOIN LATERAL (
        SELECT value FROM jsonb_each(nodes.node) WHERE jsonb_typeof(nodes.node) = 'object'
        UNION ALL
        SELECT value FROM jsonb_array_elements(nodes.node) WHERE jsonb_typeof(nodes.node) = 'array'
      ) AS child
    ), unsafe AS (
      SELECT 1 FROM nodes
      WHERE jsonb_typeof(node) = 'object'
        AND node ?| ARRAY['privateKey', 'password', 'apiKey', 'webhookSecret', 'refreshToken']
    )
    SELECT NOT EXISTS (SELECT 1 FROM unsafe)
       AND EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE key = 'web_push_vapid_public_key')
       AND EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE key = 'booking_payment_public_config')
  `, "derived runtime projections and audit contain no credential-shaped fields");
  assertSqlTrue(
    "SELECT count(*) > 0 AND bool_and(source = 's5_1_backfill') FROM public.app_runtime_settings_audit",
    "migration backfill audit rows carry their explicit source marker",
  );
}

function assertIdempotenceAndAuditTransaction() {
  sql("TRUNCATE public.app_runtime_settings_audit;", "clear backfill audit evidence before idempotence probe");
  apply("apps/webapp/db/drizzle-migrations/0209_s5_runtime_settings_audit_contract.sql", "idempotent 0209 reapply");
  assertSqlTrue(
    "SELECT count(*) = 0 FROM public.app_runtime_settings_audit",
    "idempotent reapply writes no additional audit history",
  );
  assertSqlTrue(`
    SELECT value_json = '{"value":"destination-newer"}'::jsonb
    FROM public.app_runtime_settings
    WHERE key = 'debug_forward_to_admin' AND scope = 'admin' AND organization_id IS NULL
  `, "idempotent reapply retains newer destination data");
  sql(`
    INSERT INTO public.app_runtime_settings (key, scope, audience, value_json, updated_by)
    VALUES ('smoke_audit_write', 'admin', 'server', '{"value":"first"}'::jsonb, '${actor}');
  `, "audit insert probe");
  assertSqlTrue(`
    SELECT count(*) = 1
       AND bool_and(old_value_json IS NULL)
       AND bool_and(source = 'runtime_store_write')
    FROM public.app_runtime_settings_audit WHERE key = 'smoke_audit_write'
  `, "one audit row for insert");
  sql(`
    UPDATE public.app_runtime_settings
    SET value_json = '{"value":"second"}'::jsonb
    WHERE key = 'smoke_audit_write' AND scope = 'admin' AND organization_id IS NULL;
  `, "audit update probe");
  assertSqlTrue(`
    SELECT count(*) = 2
       AND (SELECT old_value_json FROM public.app_runtime_settings_audit
              WHERE key = 'smoke_audit_write' ORDER BY changed_at DESC, id DESC LIMIT 1)
           = '{"value":"first"}'::jsonb
    FROM public.app_runtime_settings_audit WHERE key = 'smoke_audit_write'
  `, "one additional audit row for update");
  sql(`
    BEGIN;
    INSERT INTO public.app_runtime_settings (key, scope, audience, value_json)
    VALUES ('smoke_rollback_write', 'admin', 'server', '{"value":"rollback"}'::jsonb);
    ROLLBACK;
  `, "rollback audit probe");
  assertSqlTrue(`
    SELECT NOT EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE key = 'smoke_rollback_write')
       AND NOT EXISTS (SELECT 1 FROM public.app_runtime_settings_audit WHERE key = 'smoke_rollback_write')
  `, "rollback leaves neither runtime nor audit row");
}

function assertS53DualWriteTriggerContract() {
  apply(
    "apps/webapp/db/drizzle-migrations/0210_s5_runtime_dual_write_trigger_bypass.sql",
    "0210 explicit dual-write trigger wrapper",
  );
  apply(
    "apps/webapp/db/drizzle-migrations/0210_s5_runtime_dual_write_trigger_bypass.sql",
    "idempotent 0210 reapply",
  );
  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before dual-write probe");
  sql(`
    UPDATE public.system_settings
       SET value_json = '{"value":{"publicKey":"s5-vapid-public","privateKey":"s5-vapid-private"}}'::jsonb,
           updated_at = now(), updated_by = '${actor}'
     WHERE key = 'web_push_vapid' AND scope = 'admin' AND organization_id IS NULL;
  `, "legacy VAPID write");
  assertSqlTrue(`
    WITH RECURSIVE nodes(node) AS (
      SELECT value_json FROM public.app_runtime_settings WHERE key = 'web_push_vapid_public_key'
      UNION ALL SELECT new_value_json FROM public.app_runtime_settings_audit WHERE key = 'web_push_vapid_public_key'
      UNION ALL SELECT old_value_json FROM public.app_runtime_settings_audit WHERE key = 'web_push_vapid_public_key'
      UNION ALL
      SELECT child.value FROM nodes
      CROSS JOIN LATERAL (
        SELECT value FROM jsonb_each(nodes.node) WHERE jsonb_typeof(nodes.node) = 'object'
        UNION ALL SELECT value FROM jsonb_array_elements(nodes.node) WHERE jsonb_typeof(nodes.node) = 'array'
      ) AS child
      WHERE nodes.node IS NOT NULL
    )
    SELECT (SELECT count(*) FROM public.app_runtime_settings_audit WHERE key = 'web_push_vapid_public_key') = 1
       AND EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE key = 'web_push_vapid_public_key')
       AND NOT EXISTS (SELECT 1 FROM nodes WHERE jsonb_typeof(node) = 'object' AND node ? 'privateKey')
  `, "legacy VAPID write has one safe runtime audit");

  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before payment projection probe");
  sql(`
    INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
    VALUES (
      'booking_payment_providers', 'admin', '${organization}',
      '{"value":{"enabled":true,"defaultProviderId":"s5-provider","providers":[{"id":"s5-provider","label":"S5 provider","enabled":true,"apiKey":"s5-api-key","webhookSecret":"s5-webhook-secret"}]}}'::jsonb,
      now(), '${actor}'
    );
  `, "legacy organization payment write");
  assertSqlTrue(`
    WITH RECURSIVE nodes(node) AS (
      SELECT value_json FROM public.app_runtime_settings
      WHERE key = 'booking_payment_public_config' AND organization_id = '${organization}'
      UNION ALL SELECT new_value_json FROM public.app_runtime_settings_audit
      WHERE key = 'booking_payment_public_config' AND organization_id = '${organization}'
      UNION ALL SELECT old_value_json FROM public.app_runtime_settings_audit
      WHERE key = 'booking_payment_public_config' AND organization_id = '${organization}'
      UNION ALL
      SELECT child.value FROM nodes
      CROSS JOIN LATERAL (
        SELECT value FROM jsonb_each(nodes.node) WHERE jsonb_typeof(nodes.node) = 'object'
        UNION ALL SELECT value FROM jsonb_array_elements(nodes.node) WHERE jsonb_typeof(nodes.node) = 'array'
      ) AS child
      WHERE nodes.node IS NOT NULL
    )
    SELECT (SELECT count(*) FROM public.app_runtime_settings_audit
            WHERE key = 'booking_payment_public_config' AND organization_id = '${organization}') = 1
       AND EXISTS (SELECT 1 FROM public.app_runtime_settings
                   WHERE key = 'booking_payment_public_config' AND organization_id = '${organization}')
       AND NOT EXISTS (SELECT 1 FROM nodes
                       WHERE jsonb_typeof(node) = 'object'
                         AND node ?| ARRAY['apiKey', 'webhookSecret'])
  `, "legacy organization payment write has one safe runtime audit");

  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before OAuth projection probe");
  sql(`
    UPDATE public.system_settings
       SET value_json = '{"value":"s5-oauth-client"}'::jsonb, updated_at = now(), updated_by = '${actor}'
     WHERE key = 'yandex_oauth_client_id' AND scope = 'admin' AND organization_id IS NULL;
  `, "legacy OAuth writer after 0210");
  assertSqlTrue(`
    SELECT (SELECT count(*) FROM public.app_runtime_settings_audit WHERE key = 'oauth_yandex_enabled') = 1
       AND (SELECT value_json = '{"value":true}'::jsonb FROM public.app_runtime_settings
            WHERE key = 'oauth_yandex_enabled' AND scope = 'admin' AND organization_id IS NULL)
  `, "OAuth derived projection remains functional and singly audited");

  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before SMS projection probe");
  sql(`
    UPDATE public.system_settings
       SET value_json = '{"value":false}'::jsonb, updated_at = now(), updated_by = '${actor}'
     WHERE key = 'sms_fallback_enabled' AND scope = 'doctor' AND organization_id IS NULL;
  `, "legacy SMS writer after 0210");
  assertSqlTrue(`
    SELECT (SELECT count(*) FROM public.app_runtime_settings_audit WHERE key = 'public_sms_fallback_enabled') = 1
       AND (SELECT value_json = '{"value":false}'::jsonb FROM public.app_runtime_settings
            WHERE key = 'public_sms_fallback_enabled' AND scope = 'admin' AND organization_id IS NULL)
  `, "SMS derived projection remains functional and singly audited");

  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before explicit dual-write probe");
  sql(`
    BEGIN;
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES ('patient_program_discussion_ui_enabled', 'admin', NULL, 'authenticated_client',
            '{"value":true}'::jsonb, now(), '${actor}')
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                  updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    SELECT set_config('app.runtime_settings_explicit_dual_write', 'on', true);
    UPDATE public.system_settings
       SET value_json = '{"value":true}'::jsonb, updated_at = now(), updated_by = '${actor}'
     WHERE key = 'patient_program_discussion_ui_enabled' AND scope = 'admin' AND organization_id IS NULL;
    COMMIT;
  `, "explicit dual-write legacy compatibility update");
  assertSqlTrue(
    "SELECT count(*) = 1 FROM public.app_runtime_settings_audit WHERE key = 'patient_program_discussion_ui_enabled'",
    "explicit dual-write produces exactly one runtime audit",
  );
  sql("TRUNCATE public.app_runtime_settings_audit;", "clear audit evidence before manual legacy probe");
  sql(`
    UPDATE public.system_settings
       SET value_json = '{"value":"legacy-writer"}'::jsonb, updated_at = now(), updated_by = '${actor}'
     WHERE key = 'patient_program_discussion_ui_enabled' AND scope = 'admin' AND organization_id IS NULL;
  `, "ordinary legacy writer update");
  assertSqlTrue(
    "SELECT count(*) = 1 FROM public.app_runtime_settings_audit",
    "manual or ops-style legacy writer retains exactly one runtime audit through the trigger",
  );
}

let port;
try {
  if (!existsSync(path.join(pgBin, "initdb"))) fail("PostgreSQL 16 binaries are unavailable");
  port = await reservePrivatePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"], undefined, "private initdb");
  run(
    path.join(pgBin, "pg_ctl"),
    ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"],
    undefined,
    "private PostgreSQL startup",
  );
  serverStarted = true;
  run(path.join(pgBin, "createdb"), ["-h", socket, "-p", port, db], undefined, "private scratch database creation");
  const normalDefinitions = installMinimalPredecessorAndFixture();
  apply("apps/webapp/db/drizzle-migrations/0209_s5_runtime_settings_audit_contract.sql", "0209 initial apply");
  assertSchemaContract();
  assertBackfillContract(normalDefinitions);
  assertIdempotenceAndAuditTransaction();
  assertS53DualWriteTriggerContract();
  console.log("S5 runtime settings private PostgreSQL migration proof: OK (aggregate-only)");
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], {
      encoding: "utf8",
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
