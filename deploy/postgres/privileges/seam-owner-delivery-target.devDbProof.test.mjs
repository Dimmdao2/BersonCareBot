/**
 * D17 rollback-only proof on the named DEV database.
 *
 * Failure caught: a SECURITY DEFINER delivery root reached user_contacts and
 * user_channel_preferences while its owner had no complete table SELECT. The live call failed
 * with 42501 even though the webapp principal had valid context. Both candidate SELECT grants are
 * revoked independently; each mutation must turn the successful root call into 42501.
 *
 * Run:
 *   RUN_D17_SEAM_OWNER_DB=1 node --test \
 *     deploy/postgres/privileges/seam-owner-delivery-target.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ENABLED = process.env.RUN_D17_SEAM_OWNER_DB === '1';
const DATABASE = process.env.D17_SEAM_OWNER_PROOF_DB ?? 'bcb_webapp_dev';
const PRIVILEGES = new URL('../generated/privileges.bcb_webapp_dev.sql', import.meta.url);

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync('sudo', [
    '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
    '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
    '-v', 'ON_ERROR_STOP=1', '-f', '-',
  ], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function parsed(output) {
  return Object.fromEntries(output.split('\n').filter((line) => line.includes('=')).map((line) => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1)];
  }));
}

function proofSql() {
  const generatedGrants = readFileSync(PRIVILEGES, 'utf8').split('\n').filter((line) =>
    line.includes('GRANT SELECT ON TABLE "public"."user_')
      && line.endsWith('TO "app_seam_delivery_scope_owner";'));
  assert.deepEqual(generatedGrants, [
    'GRANT SELECT ON TABLE "public"."user_channel_preferences" TO "app_seam_delivery_scope_owner";',
    'GRANT SELECT ON TABLE "public"."user_contacts" TO "app_seam_delivery_scope_owner";',
  ]);
  return String.raw`
BEGIN;
${generatedGrants.join('\n')}

CREATE OR REPLACE FUNCTION pg_temp.accept_delivery_context(
  p_capability_id uuid,
  p_organization_id uuid,
  p_platform_user_id uuid,
  p_now timestamp with time zone
) RETURNS void LANGUAGE plpgsql AS $accept$
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities WHERE capability_id = p_capability_id;

  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT p_capability_id, declared.port, session_user, declared.target_role,
         declared.context_class, declared.purpose, declared.function_identity
    FROM app_ext.port_context_capabilities AS declared
   WHERE declared.target_role = 'app_tenant_service'::name
     AND declared.context_class = 'tenant_service'::app.port_context_class
     AND declared.purpose = 'integrator.delivery-targets.read'
     AND declared.function_identity =
       'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)'::regprocedure
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery target capability is absent'; END IF;

  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, organization_id
  )
  SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
         capability.session_login, capability.port, capability.target_role,
         capability.context_class, capability.purpose, capability.function_identity,
         app.hash_port_typed_args(ARRAY[
           ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
           ROW('text@1', NULL)::app.port_typed_arg,
           ROW('text@1', NULL)::app.port_typed_arg,
           ROW('text@1', NULL)::app.port_typed_arg,
           ROW('uuid@1', pg_catalog.uuid_send(p_platform_user_id))::app.port_typed_arg,
           ROW('bigint@1', NULL)::app.port_typed_arg,
           ROW('text@1', pg_catalog.textsend('appointment_reminder'))::app.port_typed_arg,
           ROW('timestamptz@1', pg_catalog.timestamptz_send(p_now))::app.port_typed_arg
         ]), p_organization_id
    FROM pg_database AS database, app_ext.port_context_capabilities AS capability
   WHERE database.datname = current_database()
     AND capability.capability_id = p_capability_id;
END $accept$;

CREATE TEMP TABLE probe_fixture AS
SELECT enrollment.organization_id, enrollment.platform_user_id,
       '2026-08-23 12:00:00+03'::timestamptz AS probe_now
  FROM public.org_enrollments AS enrollment
  JOIN public.platform_users AS holder ON holder.id = enrollment.platform_user_id
 WHERE enrollment.status = 'active'
   AND holder.merged_into_id IS NULL
   AND holder.is_archived = false
 ORDER BY enrollment.created_at DESC
 LIMIT 1;
DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM probe_fixture) THEN
    RAISE EXCEPTION 'named DEV needs one active enrollment for D17 seam-owner proof';
  END IF;
END $fixture$;

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, key text NOT NULL, value text NOT NULL);

CREATE OR REPLACE FUNCTION pg_temp.call_delivery_target() RETURNS text LANGUAGE plpgsql AS $call$
DECLARE fixture probe_fixture%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  PERFORM pg_temp.accept_delivery_context(
    '00000000-0000-4000-8000-0000000000d9'::uuid,
    fixture.organization_id, fixture.platform_user_id, fixture.probe_now
  );
  EXECUTE 'SET LOCAL ROLE app_tenant_service';
  BEGIN
    result := app.read_integrator_delivery_target_snapshot(
      fixture.organization_id, NULL, NULL, NULL, fixture.platform_user_id, NULL,
      'appointment_reminder', fixture.probe_now
    );
    EXECUTE 'RESET ROLE';
    RETURN result::text;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RETURN SQLSTATE;
  END;
END $call$;

INSERT INTO probe_out(key, value) VALUES ('baseline', pg_temp.call_delivery_target());

REVOKE SELECT ON TABLE public.user_contacts FROM app_seam_delivery_scope_owner;
INSERT INTO probe_out(key, value) VALUES ('without_user_contacts', pg_temp.call_delivery_target());
GRANT SELECT ON TABLE public.user_contacts TO app_seam_delivery_scope_owner;

REVOKE SELECT ON TABLE public.user_channel_preferences FROM app_seam_delivery_scope_owner;
INSERT INTO probe_out(key, value) VALUES ('without_user_channel_preferences', pg_temp.call_delivery_target());

SELECT key || '=' || value FROM probe_out ORDER BY ord;
ROLLBACK;
`;
}

test('delivery target root reads both relations and each revoked owner SELECT fails with 42501',
  { skip: !ENABLED }, () => {
    const result = parsed(psql(proofSql()));
    assert.match(result.baseline ?? '', /"ok"\s*:/u);
    assert.equal(result.without_user_contacts, '42501');
    assert.equal(result.without_user_channel_preferences, '42501');
  });
