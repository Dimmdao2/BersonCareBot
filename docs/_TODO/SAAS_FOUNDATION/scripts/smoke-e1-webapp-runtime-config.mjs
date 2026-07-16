#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const suffix = `${process.pid}_${Date.now()}`;
const db = `bcb_saas_e1_config_scratch_${suffix}`;
const publicRole = `bcb_e1_public_${suffix}`;
const migrationOwner = `bcb_e1_owner_${suffix}`;
if (!db.startsWith("bcb_saas_") || !db.includes("scratch")) throw new Error("unsafe scratch name");
if (!/^bcb_e1_public_[0-9_]+$/.test(publicRole)) throw new Error("unsafe scratch role name");
if (!/^bcb_e1_owner_[0-9_]+$/.test(migrationOwner)) throw new Error("unsafe scratch owner name");

function run(args, input) {
  const result = spawnSync("sudo", ["-n", "-u", "postgres", ...args], { encoding: "utf8", input });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
    throw new Error(`postgres command failed: ${result.status}`);
  }
}
function psql(sql) { run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", db], sql); }

const setup = `
CREATE SCHEMA app;
CREATE TABLE public.be_organizations (id uuid PRIMARY KEY);
CREATE TABLE public.platform_users (id uuid PRIMARY KEY, phone_normalized text);
CREATE TABLE public.user_channel_bindings (
  user_id uuid NOT NULL REFERENCES public.platform_users(id),
  channel_code text NOT NULL,
  external_id text NOT NULL
);
CREATE TABLE public.org_enrollments (
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id),
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id),
  status text NOT NULL
);
CREATE TABLE app.principal_context (
  backend_pid integer PRIMARY KEY,
  org_id uuid,
  patient_user_id uuid,
  expires_epoch bigint NOT NULL
);
CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog
AS $$ SELECT org_id FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint $$;
CREATE OR REPLACE FUNCTION app.current_patient_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog
AS $$ SELECT patient_user_id FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint $$;
CREATE TABLE public.system_settings (
  key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
CREATE UNIQUE INDEX system_settings_global_uq ON public.system_settings(key, scope) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX system_settings_org_uq ON public.system_settings(key, scope, organization_id) WHERE organization_id IS NOT NULL;
CREATE TABLE public.system_settings_audit (id bigserial PRIMARY KEY);
INSERT INTO public.be_organizations VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.platform_users VALUES
  ('10000000-0000-4000-8000-000000000001', '+79990000001'),
  ('10000000-0000-4000-8000-000000000002', '+79990000002');
INSERT INTO public.user_channel_bindings VALUES
  ('10000000-0000-4000-8000-000000000001', 'telegram', 'tg-test'),
  ('10000000-0000-4000-8000-000000000002', 'telegram', 'tg-other');
INSERT INTO public.org_enrollments VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'active');
`;
const seed = `
INSERT INTO public.system_settings(key,scope,organization_id,value_json) VALUES
('yandex_oauth_client_id','admin',NULL,'{"value":"public-id"}'),
('yandex_oauth_client_secret','admin',NULL,'{"value":"TOP_SECRET_Y"}'),
('yandex_oauth_redirect_uri','admin',NULL,'{"value":"https://example.test/y"}'),
('google_client_id','admin',NULL,'{"value":"public-id"}'),
('google_client_secret','admin',NULL,'{"value":"TOP_SECRET_G"}'),
('google_oauth_login_redirect_uri','admin',NULL,'{"value":"https://example.test/g"}'),
('apple_oauth_client_id','admin',NULL,'{"value":"public-id"}'),
('apple_oauth_redirect_uri','admin',NULL,'{"value":"https://example.test/a"}'),
('apple_oauth_team_id','admin',NULL,'{"value":"team"}'),
('apple_oauth_key_id','admin',NULL,'{"value":"kid"}'),
('apple_oauth_private_key','admin',NULL,'{"value":"TOP_SECRET_A"}'),
('specialist_signup_enabled','admin',NULL,'{"value":true}'),
('sms_fallback_enabled','doctor',NULL,'{"value":false}'),
('debug_forward_to_admin','admin',NULL,'{"value":true}'),
('video_presign_ttl_seconds','admin',NULL,'{"value":7200}'),
('test_account_identifiers','admin',NULL,
 '{"value":{"phones":["+79990000001"],"telegramIds":["tg-test"],"maxIds":[]}}'),
('patient_booking_url','admin','00000000-0000-4000-8000-000000000001','{"value":"https://booking.example.test"}');
`;
const proof = `
GRANT USAGE ON SCHEMA app TO ${publicRole};
GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO ${publicRole};
GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text) TO ${publicRole};
SELECT 1 / (NOT has_table_privilege('${publicRole}','public.system_settings','SELECT'))::int;
-- Reproduce the TEST pre-D3.4 state: the base login still inherits app_patient,
-- so effective projection SELECT is expected even though E1 grants no table ACL directly.
SELECT 1 / has_table_privilege('${publicRole}','public.app_runtime_settings','SELECT')::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_class AS relation
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relation.relacl, acldefault('r', relation.relowner))
  ) AS privilege
  WHERE relation.oid IN (
    'public.app_runtime_settings'::regclass,
    'public.system_settings'::regclass
  )
    AND privilege.privilege_type = 'SELECT'
    AND privilege.grantee IN (
      0,
      (SELECT oid FROM pg_roles WHERE rolname = '${publicRole}')
    )
))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_class AS relation
  WHERE relation.oid IN (
    'public.app_runtime_settings'::regclass,
    'public.system_settings'::regclass
  )
    AND pg_has_role('${publicRole}', relation.relowner, 'MEMBER')
))::int;
SET SESSION AUTHORIZATION ${publicRole};
SELECT 1 / ((SELECT value_json FROM app.read_public_runtime_setting('oauth_google_enabled','admin'))='{"value":true}'::jsonb)::int;
SELECT 1 / ((SELECT count(*) FROM app.read_public_runtime_setting('debug_forward_to_admin','admin'))=0)::int;
SELECT 1 / ((SELECT value_json FROM app.read_webapp_server_runtime_setting('debug_forward_to_admin','admin'))='{"value":true}'::jsonb)::int;
SELECT 1 / ((SELECT value_json FROM app.read_webapp_server_runtime_setting('video_presign_ttl_seconds','admin'))='{"value":7200}'::jsonb)::int;
RESET SESSION AUTHORIZATION;
UPDATE public.system_settings SET value_json='{"value":false}'
WHERE key='debug_forward_to_admin' AND scope='admin' AND organization_id IS NULL;
UPDATE public.system_settings SET value_json='{"value":120}'
WHERE key='video_presign_ttl_seconds' AND scope='admin' AND organization_id IS NULL;
UPDATE public.system_settings SET value_json='{"value":true}'
WHERE key='sms_fallback_enabled' AND scope='doctor' AND organization_id IS NULL;
SELECT 1 / ((SELECT value_json FROM public.app_runtime_settings WHERE key='debug_forward_to_admin' AND organization_id IS NULL)='{"value":false}'::jsonb)::int;
SELECT 1 / ((SELECT value_json FROM public.app_runtime_settings WHERE key='video_presign_ttl_seconds' AND organization_id IS NULL)='{"value":120}'::jsonb)::int;
SELECT 1 / ((SELECT value_json FROM public.app_runtime_settings WHERE key='public_sms_fallback_enabled' AND organization_id IS NULL)='{"value":true}'::jsonb)::int;
SELECT 1 / (NOT has_table_privilege('app_patient','public.system_settings','SELECT'))::int;
SELECT 1 / has_table_privilege('app_patient','public.app_runtime_settings','SELECT')::int;
SELECT 1 / (NOT has_function_privilege('app_patient','app.read_webapp_server_runtime_setting(text,text)','EXECUTE'))::int;
SELECT 1 / has_function_privilege('app_patient','app.is_current_patient_test_account()','EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege('app_staff','app.is_current_patient_test_account()','EXECUTE'))::int;
SELECT 1 / (NOT has_table_privilege('app_patient','public.system_settings','SELECT'))::int;
INSERT INTO app.principal_context VALUES (
  pg_backend_pid(),
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  floor(extract(epoch FROM clock_timestamp()))::bigint + 300
);
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / app.is_current_patient_test_account()::int;
RESET SESSION AUTHORIZATION;
UPDATE app.principal_context SET org_id = '00000000-0000-4000-8000-000000000002';
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / (NOT app.is_current_patient_test_account())::int;
RESET SESSION AUTHORIZATION;
UPDATE app.principal_context SET org_id = '00000000-0000-4000-8000-000000000001';
UPDATE public.org_enrollments SET status = 'archived'
WHERE organization_id = '00000000-0000-4000-8000-000000000001'
  AND platform_user_id = '10000000-0000-4000-8000-000000000001';
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / (NOT app.is_current_patient_test_account())::int;
RESET SESSION AUTHORIZATION;
UPDATE public.org_enrollments SET status = 'active'
WHERE organization_id = '00000000-0000-4000-8000-000000000001'
  AND platform_user_id = '10000000-0000-4000-8000-000000000001';
UPDATE app.principal_context SET
  org_id = '00000000-0000-4000-8000-000000000001',
  patient_user_id = '10000000-0000-4000-8000-000000000002';
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / (NOT app.is_current_patient_test_account())::int;
RESET SESSION AUTHORIZATION;
DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid();
INSERT INTO app.principal_context VALUES (
  pg_backend_pid(),
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  floor(extract(epoch FROM clock_timestamp()))::bigint + 300
);
UPDATE public.system_settings
SET value_json = '{"value":{"phones":"+79990000001","telegramIds":{},"maxIds":null}}'
WHERE key = 'test_account_identifiers' AND scope = 'admin' AND organization_id IS NULL;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / (NOT app.is_current_patient_test_account())::int;
RESET SESSION AUTHORIZATION;
DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid();
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / (NOT app.is_current_patient_test_account())::int;
RESET SESSION AUTHORIZATION;
SELECT 1 / ((SELECT count(*) FROM public.app_runtime_settings WHERE key IN ('oauth_yandex_enabled','oauth_google_enabled','oauth_apple_enabled') AND value_json='{"value":true}'::jsonb)=3)::int;
SELECT 1 / (NOT EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE key LIKE '%secret%' OR value_json::text LIKE '%TOP_SECRET%'))::int;
UPDATE public.system_settings SET value_json='{"value":""}' WHERE key='google_client_secret' AND scope='admin' AND organization_id IS NULL;
SELECT 1 / ((SELECT value_json FROM public.app_runtime_settings WHERE key='oauth_google_enabled' AND scope='admin' AND organization_id IS NULL)='{"value":false}'::jsonb)::int;
INSERT INTO public.system_settings(key,scope,organization_id,value_json)
VALUES ('patient_booking_url','admin',NULL,'{"value":"https://wrong-global.example.test"}');
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM public.app_runtime_settings
  WHERE key='patient_booking_url' AND scope='admin' AND organization_id IS NULL
))::int;
SET SESSION AUTHORIZATION app_patient;
SET app.org = '00000000-0000-4000-8000-000000000001';
SELECT 1 / ((SELECT count(*) FROM public.app_runtime_settings WHERE audience='server')=0)::int;
SELECT 1 / ((SELECT value_json->>'value' FROM public.app_runtime_settings WHERE key='patient_booking_url' ORDER BY organization_id IS NULL ASC LIMIT 1)='https://booking.example.test')::int;
RESET SESSION AUTHORIZATION;
`;

const runtimeAcl = `
GRANT USAGE ON SCHEMA app TO app_patient, app_owner;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
GRANT SELECT ON TABLE public.system_settings, public.platform_users,
  public.user_channel_bindings, public.org_enrollments TO app_owner;
ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.is_current_patient_test_account() OWNER TO app_owner;
REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;
REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings FROM ${publicRole};
REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC, app_patient, app_staff;
REVOKE ALL ON FUNCTION app.is_current_patient_test_account() FROM PUBLIC, app_staff, ${publicRole};
GRANT EXECUTE ON FUNCTION app.is_current_patient_test_account() TO app_patient;
`;

function asMigrationOwner(sql) {
  return `SET ROLE ${migrationOwner};\n${sql}\nRESET ROLE;`;
}

try {
  run(["createuser", "--no-login", publicRole]);
  run(["createuser", "--no-login", migrationOwner]);
  run(["createdb", "--owner", migrationOwner, db]);
  psql(`SELECT 1 / (NOT pg_has_role('${migrationOwner}', 'app_owner', 'MEMBER'))::int;`);
  psql(asMigrationOwner(setup));
  psql(asMigrationOwner(readFileSync("apps/webapp/db/drizzle-migrations/0185_saas_isolation_diagnostics.sql", "utf8")));
  psql(asMigrationOwner(readFileSync("apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql", "utf8")));
  psql(asMigrationOwner(seed));
  psql(`ALTER ROLE ${migrationOwner} BYPASSRLS;`);
  psql(asMigrationOwner(readFileSync("apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql", "utf8")));
  psql(asMigrationOwner(readFileSync("apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql", "utf8")));
  psql(`ALTER ROLE ${migrationOwner} NOBYPASSRLS;`);
  psql(runtimeAcl);
  psql(`
    ALTER ROLE ${publicRole} INHERIT;
    GRANT app_patient TO ${publicRole} WITH INHERIT TRUE, SET TRUE;
    SELECT 1 / (EXISTS (
      SELECT 1
      FROM pg_auth_members AS membership
      JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles AS member_role ON member_role.oid = membership.member
      WHERE granted_role.rolname = 'app_patient'
        AND member_role.rolname = '${publicRole}'
        AND membership.inherit_option
        AND membership.set_option
        AND NOT membership.admin_option
    ))::int;
  `);
  psql(proof);
  console.log("smoke-e1-webapp-runtime-config: OK");
} finally {
  run(["dropdb", "--if-exists", db]);
  run(["dropuser", "--if-exists", publicRole]);
  run(["dropuser", "--if-exists", migrationOwner]);
}
