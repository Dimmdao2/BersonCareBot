/**
 * D17 regression proof on a named DEV/TEST database.
 *
 * Failure caught: after the integrator login stopped carrying `app_tenant_service`, booking and
 * delivery code entered `app_integrator_tenant_service` but could neither EXECUTE nor pass the
 * body gate of three shared roots. A booking was created while its confirmation/reminders were
 * lost behind 42501. The credential root must also reject an organization argument that differs
 * from the organization already accepted in the port context, or one clinic can read another
 * clinic's delivery secrets.
 *
 * The candidate migration and generated privilege artifact are materialized inside one transaction
 * and the transaction is rolled back. No disposable database and no persistent DEV data are used.
 *
 * Run:
 *   RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test \
 *     deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  readMigrationFolder,
  selectPendingMigrations,
} from './migration-order.mjs';

const ENABLED = process.env.RUN_D17_INTEGRATOR_ROOTS_DB === '1';
const DATABASE = process.env.D17_INTEGRATOR_ROOTS_PROOF_DB ?? 'bcb_webapp_dev';
const MIGRATION_TAG = '20260824T053353_reconcile_clinic_delivery_credential_root';
const MIGRATIONS_FOLDER = new URL('../../../apps/webapp/db/drizzle-migrations/', import.meta.url);
const PRIVILEGE_ARTIFACTS = new Map([
  ['bcb_webapp_dev', new URL('../generated/privileges.bcb_webapp_dev.sql', import.meta.url)],
  ['bersoncarebot_test', new URL('../generated/privileges.bersoncarebot_test.sql', import.meta.url)],
]);

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
const PRIVILEGES = PRIVILEGE_ARTIFACTS.get(DATABASE);
if (!PRIVILEGES) {
  throw new Error(`D17 proof is allowed only on named DEV/TEST databases, got '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

function parsed(output) {
  return Object.fromEntries(
    output.split('\n').filter((line) => line.includes('=')).map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
}

function pendingCandidateMigrationSql() {
  const ledgerRows = psql('SELECT tag FROM drizzle.__drizzle_migrations ORDER BY tag')
    .split('\n')
    .filter(Boolean)
    .map((tag) => ({ tag }));
  return selectPendingMigrations(
    readMigrationFolder(fileURLToPath(MIGRATIONS_FOLDER)),
    ledgerRows,
  )
    .filter((migration) => migration.tag <= MIGRATION_TAG)
    .map((migration) => readFileSync(migration.path, 'utf8'))
    .join('\n');
}

const ACCEPT_CONTEXT_HELPER = String.raw`
CREATE OR REPLACE FUNCTION pg_temp.accept_context(
  p_capability_id uuid,
  p_target_role name,
  p_context_class app.port_context_class,
  p_purpose text,
  p_function_identity regprocedure,
  p_organization_id uuid,
  p_typed_args app.port_typed_arg[] DEFAULT ARRAY[]::app.port_typed_arg[]
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
   WHERE declared.target_role = p_target_role
     AND declared.context_class = p_context_class
     AND declared.purpose = p_purpose
     AND declared.function_identity IS NOT DISTINCT FROM p_function_identity
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no declared capability for % / % / % / %',
      p_target_role, p_context_class, p_purpose, p_function_identity;
  END IF;

  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, organization_id
  )
  SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
         capability.session_login, capability.port, capability.target_role,
         capability.context_class, capability.purpose, capability.function_identity,
         app.hash_port_typed_args(p_typed_args), p_organization_id
    FROM pg_database AS database, app_ext.port_context_capabilities AS capability
   WHERE database.datname = current_database()
     AND capability.capability_id = p_capability_id;
END $accept$;
`;

function proofSql() {
  const migrations = pendingCandidateMigrationSql();
  const privileges = readFileSync(PRIVILEGES, 'utf8');
  return String.raw`
BEGIN;
${migrations}
${privileges}
${ACCEPT_CONTEXT_HELPER}

CREATE TEMP TABLE probe_fixture AS
SELECT appointment.id AS appointment_id, appointment.organization_id, appointment.start_at,
       (SELECT organization.id
          FROM public.be_organizations AS organization
         WHERE organization.id <> appointment.organization_id
         ORDER BY organization.id
         LIMIT 1) AS foreign_organization_id
  FROM public.be_appointments AS appointment
 WHERE appointment.status IN (
   'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
   'visit_confirmed', 'charged_to_package'
 )
   AND appointment.deleted_at IS NULL
 ORDER BY appointment.start_at DESC
 LIMIT 1;
DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM probe_fixture WHERE foreign_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'named DEV needs an active appointment and a second organization for D17 proof';
  END IF;
END $fixture$;

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT 'google_refresh_token', 'admin', fixture.foreign_organization_id,
       '{"value":"D17_FOREIGN_GOOGLE_REFRESH_TOKEN"}'::jsonb, statement_timestamp(), NULL
  FROM probe_fixture AS fixture
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, key text NOT NULL, value text NOT NULL);

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT credential_key, 'admin', fixture.organization_id,
       jsonb_build_object('auditMarker', credential_key), statement_timestamp(), NULL
  FROM probe_fixture AS fixture
 CROSS JOIN unnest(ARRAY[
   'clinic_smtp_outbound', 'clinic_smsc_api_key', 'clinic_telegram_bot_token',
   'clinic_max_bot_api_key', 'clinic_vk_community_access_token',
   'clinic_transactional_mail_template'
 ]) AS credential_key
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

INSERT INTO probe_out(key, value)
SELECT 'credential_function_owner', pg_catalog.pg_get_userbyid(function.proowner)
  FROM pg_catalog.pg_proc AS function
 WHERE function.oid = 'app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure;
INSERT INTO probe_out(key, value)
SELECT 'credential_body_narrow_role',
       (position(
          'ARRAY[''app_integrator_tenant_service''::name]::name[]'
          IN function.prosrc
        ) > 0)::text
  FROM pg_catalog.pg_proc AS function
 WHERE function.oid = 'app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure;
INSERT INTO probe_out(key, value)
SELECT 'credential_body_broad_role',
       (position(
          'ARRAY[''app_tenant_service''::name]::name[]'
          IN function.prosrc
        ) > 0)::text
  FROM pg_catalog.pg_proc AS function
 WHERE function.oid = 'app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure;
INSERT INTO probe_out(key, value) VALUES
  ('credential_narrow_execute', has_function_privilege(
    'app_integrator_tenant_service',
    'app.read_integrator_clinic_delivery_credential(text,uuid)', 'EXECUTE')::text),
  ('credential_broad_execute', has_function_privilege(
    'app_tenant_service',
    'app.read_integrator_clinic_delivery_credential(text,uuid)', 'EXECUTE')::text);

-- Both walls matter. Candidate EXECUTE is already installed, so each old gate must still refuse
-- the narrow role when there is no accepted context.
DO $no_context$
DECLARE fixture probe_fixture%ROWTYPE; clinic_result text; calendar_result text; mechanic_result text;
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  EXECUTE 'SET LOCAL ROLE app_integrator_tenant_service';
  BEGIN
    PERFORM app.read_integrator_clinic_delivery_credential(
      'clinic_smtp_outbound', fixture.organization_id);
    clinic_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN clinic_result := SQLSTATE; END;

  BEGIN
    PERFORM app.read_integrator_google_calendar_setting(
      'google_calendar_id', fixture.organization_id);
    calendar_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN calendar_result := SQLSTATE; END;

  BEGIN
    PERFORM app.resolve_organization_mechanic_access(fixture.organization_id, 'booking');
    mechanic_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN mechanic_result := SQLSTATE; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO probe_out(key, value) VALUES
    ('clinic_without_context', clinic_result),
    ('calendar_without_context', calendar_result),
    ('mechanic_without_context', mechanic_result);
END $no_context$;

SELECT pg_temp.accept_context(
  '00000000-0000-4000-8000-0000000000d7'::uuid,
  'app_integrator_tenant_service', 'tenant_service', 'relation', NULL,
  (SELECT organization_id FROM probe_fixture)
);
DO $narrow$
DECLARE
  fixture probe_fixture%ROWTYPE;
  result text;
  allowed_key_count text;
  clinic_cross_org_result text;
  calendar_cross_org_result text;
  mechanic_cross_org_result text;
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  EXECUTE 'SET LOCAL ROLE app_integrator_tenant_service';
  BEGIN
    PERFORM app.read_integrator_clinic_delivery_credential(
      'clinic_smtp_outbound', fixture.foreign_organization_id);
    clinic_cross_org_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN clinic_cross_org_result := SQLSTATE; END;

  BEGIN
    SELECT app.read_integrator_google_calendar_setting(
      'google_refresh_token', fixture.foreign_organization_id)::text
      INTO calendar_cross_org_result;
  EXCEPTION WHEN OTHERS THEN calendar_cross_org_result := SQLSTATE; END;

  BEGIN
    PERFORM app.resolve_organization_mechanic_access(
      fixture.foreign_organization_id, 'booking');
    mechanic_cross_org_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN mechanic_cross_org_result := SQLSTATE; END;

  PERFORM app.read_integrator_clinic_delivery_credential(
    'clinic_smtp_outbound', fixture.organization_id);

  SELECT count(*)::text INTO allowed_key_count
    FROM unnest(ARRAY[
      'clinic_smtp_outbound', 'clinic_smsc_api_key', 'clinic_telegram_bot_token',
      'clinic_max_bot_api_key', 'clinic_vk_community_access_token',
      'clinic_transactional_mail_template'
    ]) AS credential_key
   WHERE app.read_integrator_clinic_delivery_credential(
     credential_key, fixture.organization_id) ->> 'auditMarker' = credential_key;

  PERFORM app.read_integrator_google_calendar_setting(
    'google_calendar_id', fixture.organization_id);

  SELECT count(*)::text INTO result
    FROM app.resolve_organization_mechanic_access(fixture.organization_id, 'booking');
  EXECUTE 'RESET ROLE';
  INSERT INTO probe_out(key, value) VALUES
    ('clinic_cross_org', clinic_cross_org_result),
    ('calendar_cross_org', calendar_cross_org_result),
    ('mechanic_cross_org', mechanic_cross_org_result),
    ('clinic_with_context', 'ALLOWED'),
    ('credential_allowed_key_count', allowed_key_count),
    ('calendar_with_context', 'ALLOWED'),
    ('mechanic_with_context', result);
END $narrow$;

DO $broad$
DECLARE fixture probe_fixture%ROWTYPE; broad_result text;
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  EXECUTE 'SET LOCAL ROLE app_tenant_service';
  BEGIN
    PERFORM app.read_integrator_clinic_delivery_credential(
      'clinic_smtp_outbound', fixture.organization_id);
    broad_result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN broad_result := SQLSTATE; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO probe_out(key, value) VALUES ('credential_broad_call', broad_result);
END $broad$;

-- The narrow role still has no direct read/write privilege on medical product relations.
INSERT INTO probe_out(key, value)
SELECT 'medical_relation_privileges', count(*)::text
  FROM unnest(ARRAY[
    'public.patient_bookings', 'public.treatment_program_instances', 'public.symptom_entries'
  ]) AS relation_name
 WHERE has_table_privilege('app_integrator_tenant_service', relation_name, 'SELECT')
    OR has_table_privilege('app_integrator_tenant_service', relation_name, 'INSERT')
    OR has_table_privilege('app_integrator_tenant_service', relation_name, 'UPDATE')
    OR has_table_privilege('app_integrator_tenant_service', relation_name, 'DELETE');

INSERT INTO probe_out(key, value)
VALUES (
  'tariff_helper_direct_execute',
  has_function_privilege(
    'app_integrator_tenant_service',
    'app.saas_billing_effective_tariff(uuid,uuid)',
    'EXECUTE'
  )::text
);

-- Separate end-to-end DB materialization: the real webapp door receives one transport-ready
-- appointment reminder, replaces the generation, and leaves a pending queue row. Everything is
-- rolled back with the candidate privilege/gate materialization.
SELECT pg_temp.accept_context(
  '00000000-0000-4000-8000-0000000000d8'::uuid,
  'app_tenant_service', 'tenant_service', 'reminder.appointment-generation.replace',
  'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)'::regprocedure,
  fixture.organization_id,
  ARRAY[
    ROW('uuid@1', pg_catalog.uuid_send(fixture.organization_id))::app.port_typed_arg,
    ROW('uuid@1', pg_catalog.uuid_send(fixture.appointment_id))::app.port_typed_arg,
    ROW('timestamptz@1', pg_catalog.timestamptz_send(fixture.start_at))::app.port_typed_arg,
    ROW('text@1', pg_catalog.textsend(jsonb_build_array(jsonb_build_object(
      'eventId', 'd17-materialization:' || fixture.appointment_id::text,
      'channel', 'web_push',
      'payloadJson', jsonb_build_object(
        'appointmentId', fixture.appointment_id::text,
        'generationStartAt', fixture.start_at,
        'dueAt', fixture.start_at - interval '1 hour',
        'intent', jsonb_build_object('type', 'message.send')
      ),
      'maxAttempts', 1,
      'nextRetryAt', fixture.start_at - interval '1 hour'
    ))::text))::app.port_typed_arg,
    ROW('text@1', pg_catalog.textsend('d17_rollback_proof'))::app.port_typed_arg
  ]
)
FROM probe_fixture AS fixture;

DO $materialize$
DECLARE fixture probe_fixture%ROWTYPE; deliveries text; result jsonb;
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  deliveries := jsonb_build_array(jsonb_build_object(
    'eventId', 'd17-materialization:' || fixture.appointment_id::text,
    'channel', 'web_push',
    'payloadJson', jsonb_build_object(
      'appointmentId', fixture.appointment_id::text,
      'generationStartAt', fixture.start_at,
      'dueAt', fixture.start_at - interval '1 hour',
      'intent', jsonb_build_object('type', 'message.send')
    ),
    'maxAttempts', 1,
    'nextRetryAt', fixture.start_at - interval '1 hour'
  ))::text;
  EXECUTE 'SET LOCAL ROLE app_tenant_service';
  result := app.replace_appointment_reminder_generation(
    fixture.organization_id, fixture.appointment_id, fixture.start_at,
    deliveries, 'd17_rollback_proof');
  EXECUTE 'RESET ROLE';
  INSERT INTO probe_out(key, value) VALUES ('materialization_result', result::text);
END $materialize$;

INSERT INTO probe_out(key, value)
SELECT 'materialized_queue_rows', count(*)::text
  FROM public.outgoing_delivery_queue AS queue
  JOIN probe_fixture AS fixture ON fixture.organization_id = queue.organization_id
 WHERE queue.event_id = 'd17-materialization:' || fixture.appointment_id::text
   AND queue.kind = 'appointment_reminder'
   AND queue.status = 'pending'
   AND queue.payload_json ->> 'appointmentId' = fixture.appointment_id::text;

SELECT key || '=' || value FROM probe_out ORDER BY ord;
ROLLBACK;
`;
}

test('final D17 credential root is narrow, exact-org and usable by reminder delivery',
  { skip: !ENABLED }, () => {
    const result = parsed(psql(proofSql()));
    assert.equal(result.credential_function_owner, 'app_seam_settings_integrator_owner');
    assert.equal(result.credential_body_narrow_role, 'true');
    assert.equal(result.credential_body_broad_role, 'false');
    assert.equal(result.credential_narrow_execute, 'true');
    assert.equal(result.credential_broad_execute, 'false');
    assert.equal(result.clinic_without_context, '42501');
    assert.equal(result.calendar_without_context, '42501');
    assert.equal(result.mechanic_without_context, '42501');
    assert.equal(result.clinic_cross_org, '42501');
    assert.equal(result.calendar_cross_org, '42501');
    assert.equal(result.mechanic_cross_org, '42501');
    assert.equal(result.clinic_with_context, 'ALLOWED');
    assert.equal(result.credential_allowed_key_count, '6');
    assert.equal(result.credential_broad_call, '42501');
    assert.equal(result.calendar_with_context, 'ALLOWED');
    assert.equal(result.mechanic_with_context, '1');
    assert.equal(result.medical_relation_privileges, '0');
    assert.equal(result.tariff_helper_direct_execute, 'false');
    assert.match(result.materialization_result ?? '', /"current"\s*:\s*true/u);
    assert.match(result.materialization_result ?? '', /"inserted"\s*:\s*1/u);
    assert.equal(result.materialized_queue_rows, '1');
  });
