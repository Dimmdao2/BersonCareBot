#!/usr/bin/env node
/**
 * P2-C3 patient booking/LFK value-level guards smoke.
 *
 * Scratch-only proof for deploy/postgres/p2-c3-patient-booking-lfk-guards.sql. It applies the P2-B
 * protected context artifact first, then applies P2-C3 triggers against a synthetic schema carrying
 * the real table/column names needed by the guards.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const p2bSqlPath = path.join(repoRoot, 'deploy/postgres/p2-b-protected-principal-context.sql');
const p2c3SqlPath = path.join(repoRoot, 'deploy/postgres/p2-c3-patient-booking-lfk-guards.sql');

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
const dbName = `bcb_saas_p2_c3_booking_lfk_scratch_${scratchSuffix}`;
const ownerRole = `bcb_p2_c3_context_owner_${scratchSuffix}`;
const staffRole = `bcb_p2_c3_app_staff_${scratchSuffix}`;
const patientRole = `bcb_p2_c3_app_patient_${scratchSuffix}`;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)|bersoncarebot_test/.test(dbName)) {
  throw new Error('refusing dev/prod/test-shaped scratch DB name');
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input: options.input,
    stdio: options.input != null ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw new Error(
      `${options.label ?? `${command} ${args.join(' ')}`} failed to start: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${options.label ?? `${command} ${args.join(' ')}`} failed with ${result.status ?? 'unknown status'}`,
    );
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = dbName } = {}) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    input: sql,
  });
}

function psqlFile(filePath, variables, { database = dbName } = {}) {
  const sql = readFileSync(filePath, 'utf8');
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => [
    '-v',
    `${key}=${value}`,
  ]);
  run(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database, ...variableArgs],
    {
      input: sql,
      label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
    },
  );
}

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    '\\else',
    `\\echo 'FATAL: ${message}'`,
    'SELECT 1/0; -- forces a real error under ON_ERROR_STOP',
    '\\endif',
  ].join('\n');
}

const ownerIdent = quoteIdent(ownerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const secret = randomBytes(32).toString('hex');

const orgA = 'c3000000-0000-4000-8000-0000000000a1';
const orgB = 'c3000000-0000-4000-8000-0000000000b1';
const patientA = 'c3000000-0000-4000-8000-00000000a101';
const patientB = 'c3000000-0000-4000-8000-00000000b101';
const appointmentCreate = 'c3000000-0000-4000-8000-00000000aa01';
const appointmentCancel = 'c3000000-0000-4000-8000-00000000aa02';
const appointmentReschedule = 'c3000000-0000-4000-8000-00000000aa03';
const appointmentOther = 'c3000000-0000-4000-8000-00000000bb01';
const appointmentNegative = 'c3000000-0000-4000-8000-00000000aa04';
const rescheduleRow = 'c3000000-0000-4000-8000-00000000cc01';
const cancellationRow = 'c3000000-0000-4000-8000-00000000dd01';
const complexA = 'c3000000-0000-4000-8000-00000000e101';
const complexLegacyA = 'c3000000-0000-4000-8000-00000000e102';
const complexOther = 'c3000000-0000-4000-8000-00000000e201';
const complexOrgB = 'c3000000-0000-4000-8000-00000000e301';
const sessionA = 'c3000000-0000-4000-8000-00000000f101';
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const patientNonce = `patient_${scratchSuffix}`;
const staffWithPatientContextNonce = `staff_patient_context_${scratchSuffix}`;
let dbCreated = false;
let rolesCreated = false;

const schemaSql = String.raw`
CREATE TABLE public.be_appointments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  branch_id uuid,
  room_id uuid,
  specialist_id uuid,
  service_id uuid,
  platform_user_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  original_start_at timestamptz,
  reschedule_count integer NOT NULL DEFAULT 0,
  payment_ref text,
  package_usage_ref text,
  phone_normalized text,
  attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.be_appointment_reschedules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  from_start_at timestamptz NOT NULL,
  from_end_at timestamptz NOT NULL,
  to_start_at timestamptz NOT NULL,
  to_end_at timestamptz NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  was_in_free_reschedule_window boolean NOT NULL,
  free_cancellation_available_at_reschedule boolean NOT NULL,
  free_cancellation_available_after boolean NOT NULL,
  applied_policy_id uuid,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_cancellations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  cancellation_type text NOT NULL,
  reason text,
  was_free boolean NOT NULL,
  was_penalized boolean NOT NULL,
  package_session_charged boolean NOT NULL,
  prepayment_retained boolean NOT NULL,
  prepayment_refunded boolean NOT NULL,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  applied_policy_id uuid,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_history_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lfk_complexes (
  id uuid PRIMARY KEY,
  organization_id uuid,
  user_id text NOT NULL,
  platform_user_id uuid,
  title text NOT NULL
);

CREATE TABLE public.lfk_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid,
  user_id uuid NOT NULL,
  complex_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz,
  duration_minutes smallint,
  difficulty_0_10 smallint,
  pain_0_10 smallint,
  comment text
);

INSERT INTO public.be_appointments (
  id, organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count
) VALUES
  (${quoteLiteral(appointmentCancel)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, '2030-01-01 10:00+00', '2030-01-01 11:00+00', 60, 'native', 'confirmed', '2030-01-01 10:00+00', 0),
  (${quoteLiteral(appointmentReschedule)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, '2030-01-02 10:00+00', '2030-01-02 11:00+00', 60, 'native', 'confirmed', '2030-01-02 10:00+00', 0),
  (${quoteLiteral(appointmentOther)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}::uuid, '2030-01-03 10:00+00', '2030-01-03 11:00+00', 60, 'native', 'confirmed', '2030-01-03 10:00+00', 0),
  (${quoteLiteral(appointmentNegative)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, '2030-01-04 10:00+00', '2030-01-04 11:00+00', 60, 'native', 'confirmed', '2030-01-04 10:00+00', 0);

INSERT INTO public.lfk_complexes (id, organization_id, user_id, platform_user_id, title) VALUES
  (${quoteLiteral(complexA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'owned platform complex'),
  (${quoteLiteral(complexLegacyA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}, NULL, 'owned legacy complex'),
  (${quoteLiteral(complexOther)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientB)}, ${quoteLiteral(patientB)}::uuid, 'other patient complex'),
  (${quoteLiteral(complexOrgB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'other org complex');

GRANT USAGE ON SCHEMA public TO ${patientIdent}, ${staffIdent};
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${patientIdent}, ${staffIdent};
`;

const explicitGrantProofSql = String.raw`
WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c3_is_patient_context()'),
    ('app.p2_c3_booking_row_is_owned(uuid, uuid, uuid)'),
    ('app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid)'),
    ('app.p2_c3_guard_be_appointments()'),
    ('app.p2_c3_guard_be_appointment_reschedules()'),
    ('app.p2_c3_guard_be_appointment_cancellations()'),
    ('app.p2_c3_guard_be_appointment_event_insert()'),
    ('app.p2_c3_guard_lfk_sessions()')
),
resolved_functions AS (
  SELECT signature, to_regprocedure(signature) AS function_oid
  FROM expected_functions
)
SELECT (
  count(*) = 8
  AND count(*) FILTER (WHERE function_oid IS NOT NULL) = 8
  AND NOT EXISTS (
    SELECT 1
    FROM resolved_functions resolved
    JOIN pg_proc proc ON proc.oid = resolved.function_oid
    CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
)::int AS p2_c3_public_execute_revoked
FROM resolved_functions \gset
${fatal('p2_c3_public_execute_revoked', 'P2-C3 functions must revoke PUBLIC EXECUTE')}

WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c3_is_patient_context()'),
    ('app.p2_c3_booking_row_is_owned(uuid, uuid, uuid)'),
    ('app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid)'),
    ('app.p2_c3_guard_be_appointments()'),
    ('app.p2_c3_guard_be_appointment_reschedules()'),
    ('app.p2_c3_guard_be_appointment_cancellations()'),
    ('app.p2_c3_guard_be_appointment_event_insert()'),
    ('app.p2_c3_guard_lfk_sessions()')
)
SELECT (
  bool_and(has_function_privilege(${quoteLiteral(patientRole)}, signature, 'EXECUTE'))
  AND bool_and(has_function_privilege(${quoteLiteral(staffRole)}, signature, 'EXECUTE'))
)::int AS p2_c3_explicit_execute_granted
FROM expected_functions \gset
${fatal('p2_c3_explicit_execute_granted', 'P2-C3 functions must grant EXECUTE to explicit app roles')}

SET SESSION AUTHORIZATION ${patientIdent};
SELECT app.p2_c3_is_patient_context() AS p2_c3_patient_can_execute_helper;
RESET SESSION AUTHORIZATION;

\echo 'P2-C3 explicit function grants CONFIRMED.'
`;

const proofSql = String.raw`
SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(patientNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA)},
    ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_c3_patient_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};

SELECT app.install_signed_context(
  ${quoteLiteral(patientNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c3_patient_signature'
);

INSERT INTO public.be_appointments (
  id, organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count
) VALUES (
  ${quoteLiteral(appointmentCreate)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  '2030-01-05 10:00+00', '2030-01-05 11:00+00', 60, 'public_widget', 'confirmed',
  '2030-01-05 10:00+00', 0
);

INSERT INTO public.be_appointment_events (
  id, organization_id, appointment_id, event_type, actor_id, payload
) VALUES (
  'c3000000-0000-4000-8000-000000010001'::uuid,
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCreate)}::uuid, 'created',
  ${quoteLiteral(patientA)}::uuid, '{"status":"confirmed"}'::jsonb
);
INSERT INTO public.be_appointment_history_events (
  id, organization_id, appointment_id, event_type, actor_id, payload
) VALUES (
  'c3000000-0000-4000-8000-000000010002'::uuid,
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCreate)}::uuid, 'created',
  ${quoteLiteral(patientA)}::uuid, '{"status":"confirmed"}'::jsonb
);

\set ON_ERROR_STOP off
INSERT INTO public.be_appointments (
  id, organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count
) VALUES (
  'c3000000-0000-4000-8000-00000000bad1'::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientB)}::uuid,
  '2030-01-06 10:00+00', '2030-01-06 11:00+00', 60, 'native', 'confirmed',
  '2030-01-06 10:00+00', 0
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot create booking appointment for another patient.'
\else
\echo 'FATAL: patient created booking appointment for another patient.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.be_appointment_events (
  id, organization_id, appointment_id, event_type, actor_id
) VALUES (
  'c3000000-0000-4000-8000-000000010003'::uuid,
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCreate)}::uuid, 'created',
  ${quoteLiteral(patientB)}::uuid
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge booking event actor.'
\else
\echo 'FATAL: patient forged booking event actor.'
SELECT 1/0;
\endif

UPDATE public.be_appointments
SET status = 'cancelled_by_patient', updated_at = '2030-01-01 09:10+00'
WHERE id = ${quoteLiteral(appointmentCancel)}::uuid;

INSERT INTO public.be_appointment_cancellations (
  id, organization_id, appointment_id, actor_type, actor_id, cancellation_type,
  was_free, was_penalized, package_session_charged, prepayment_retained, prepayment_refunded,
  manual_override, notifications_sent
) VALUES (
  ${quoteLiteral(cancellationRow)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCancel)}::uuid,
  'patient', ${quoteLiteral(patientA)}::uuid, 'free',
  true, false, false, false, true, false, '{}'::jsonb
);
UPDATE public.be_appointment_cancellations
SET notifications_sent = '{"patient":"sent"}'::jsonb
WHERE id = ${quoteLiteral(cancellationRow)}::uuid;

\set ON_ERROR_STOP off
UPDATE public.be_appointment_cancellations
SET staff_comment = 'forged'
WHERE id = ${quoteLiteral(cancellationRow)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cancellation UPDATE is limited to notifications_sent.'
\else
\echo 'FATAL: patient updated cancellation non-notification field.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.be_appointment_cancellations (
  id, organization_id, appointment_id, actor_type, actor_id, cancellation_type,
  was_free, was_penalized, package_session_charged, prepayment_retained, prepayment_refunded,
  staff_comment, manual_override
) VALUES (
  'c3000000-0000-4000-8000-00000000dd02'::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCancel)}::uuid,
  'patient', ${quoteLiteral(patientA)}::uuid, 'custom',
  false, true, false, false, false, 'forged', true
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge staff/manual cancellation values.'
\else
\echo 'FATAL: patient forged staff/manual cancellation values.'
SELECT 1/0;
\endif

UPDATE public.be_appointments
SET status = 'rescheduled', updated_at = '2030-01-02 09:10+00'
WHERE id = ${quoteLiteral(appointmentReschedule)}::uuid;
UPDATE public.be_appointments
SET start_at = '2030-01-09 10:00+00',
    end_at = '2030-01-09 11:00+00',
    duration_minutes = 60,
    original_start_at = '2030-01-02 10:00+00',
    reschedule_count = 1,
    status = 'confirmed',
    updated_at = '2030-01-02 09:11+00'
WHERE id = ${quoteLiteral(appointmentReschedule)}::uuid;

INSERT INTO public.be_appointment_reschedules (
  id, organization_id, appointment_id, from_start_at, from_end_at, to_start_at, to_end_at,
  actor_type, actor_id, was_in_free_reschedule_window, free_cancellation_available_at_reschedule,
  free_cancellation_available_after, manual_override, notifications_sent
) VALUES (
  ${quoteLiteral(rescheduleRow)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentReschedule)}::uuid,
  '2030-01-02 10:00+00', '2030-01-02 11:00+00', '2030-01-09 10:00+00', '2030-01-09 11:00+00',
  'patient', ${quoteLiteral(patientA)}::uuid, true, true, true, false, '{}'::jsonb
);
UPDATE public.be_appointment_reschedules
SET notifications_sent = '{"staff":"failed"}'::jsonb
WHERE id = ${quoteLiteral(rescheduleRow)}::uuid;

\set ON_ERROR_STOP off
UPDATE public.be_appointment_reschedules
SET reason = 'forged'
WHERE id = ${quoteLiteral(rescheduleRow)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient reschedule UPDATE is limited to notifications_sent.'
\else
\echo 'FATAL: patient updated reschedule non-notification field.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
UPDATE public.be_appointments
SET status = 'completed'
WHERE id = ${quoteLiteral(appointmentNegative)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot set arbitrary appointment status.'
\else
\echo 'FATAL: patient set arbitrary appointment status.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
UPDATE public.be_appointments
SET payment_ref = 'forged'
WHERE id = ${quoteLiteral(appointmentNegative)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot change protected payment fields.'
\else
\echo 'FATAL: patient changed protected payment fields.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
UPDATE public.be_appointments
SET status = 'cancelled_by_patient'
WHERE id = ${quoteLiteral(appointmentOther)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot update appointment for another owner/org.'
\else
\echo 'FATAL: patient updated appointment for another owner/org.'
SELECT 1/0;
\endif

INSERT INTO public.lfk_sessions (
  id, user_id, complex_id, completed_at, source, recorded_at, comment
) VALUES (
  ${quoteLiteral(sessionA)}::uuid, ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(complexA)}::uuid,
  '2030-02-01 10:00+00', 'webapp', '2030-02-01 10:00+00', 'done'
);
SELECT (organization_id = ${quoteLiteral(orgA)}::uuid)::int AS p2_c3_lfk_org_stamped
FROM public.lfk_sessions
WHERE id = ${quoteLiteral(sessionA)}::uuid \gset
${fatal('p2_c3_lfk_org_stamped', 'LFK session organization_id must be stamped from patient context')}

INSERT INTO public.lfk_sessions (
  id, user_id, complex_id, completed_at, source
) VALUES (
  'c3000000-0000-4000-8000-00000000f102'::uuid, ${quoteLiteral(patientA)}::uuid,
  ${quoteLiteral(complexLegacyA)}::uuid, '2030-02-02 10:00+00', 'webapp'
);

\set ON_ERROR_STOP off
INSERT INTO public.lfk_sessions (
  id, organization_id, user_id, complex_id, completed_at, source
) VALUES (
  'c3000000-0000-4000-8000-00000000f103'::uuid, ${quoteLiteral(orgB)}::uuid,
  ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(complexA)}::uuid, '2030-02-03 10:00+00', 'webapp'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot insert LFK session with mismatched org.'
\else
\echo 'FATAL: patient inserted LFK session with mismatched org.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.lfk_sessions (
  id, user_id, complex_id, completed_at, source
) VALUES (
  'c3000000-0000-4000-8000-00000000f104'::uuid, ${quoteLiteral(patientA)}::uuid,
  ${quoteLiteral(complexOther)}::uuid, '2030-02-04 10:00+00', 'webapp'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot insert LFK session for another patient complex.'
\else
\echo 'FATAL: patient inserted LFK session for another patient complex.'
SELECT 1/0;
\endif

UPDATE public.lfk_sessions
SET completed_at = '2030-02-01 10:30+00',
    duration_minutes = 30,
    difficulty_0_10 = 4,
    pain_0_10 = 2,
    comment = 'updated'
WHERE id = ${quoteLiteral(sessionA)}::uuid;

\set ON_ERROR_STOP off
UPDATE public.lfk_sessions
SET complex_id = ${quoteLiteral(complexOther)}::uuid
WHERE id = ${quoteLiteral(sessionA)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot move LFK session to another patient complex.'
\else
\echo 'FATAL: patient moved LFK session to another patient complex.'
SELECT 1/0;
\endif

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(staffWithPatientContextNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA)},
    ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_c3_staff_patient_context_signature \gset

SET SESSION AUTHORIZATION ${staffIdent};
SELECT app.install_signed_context(
  ${quoteLiteral(staffWithPatientContextNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c3_staff_patient_context_signature'
);

INSERT INTO public.be_appointment_reschedules (
  id, organization_id, appointment_id, from_start_at, from_end_at, to_start_at, to_end_at,
  actor_type, actor_id, was_in_free_reschedule_window, free_cancellation_available_at_reschedule,
  free_cancellation_available_after, staff_comment, manual_override
) VALUES (
  'c3000000-0000-4000-8000-00000000ccff'::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(appointmentOther)}::uuid,
  '2030-01-03 10:00+00', '2030-01-03 11:00+00', '2030-01-10 10:00+00', '2030-01-10 11:00+00',
  'admin', ${quoteLiteral(patientB)}::uuid, false, false, false, 'staff bypass shape', true
);

INSERT INTO public.lfk_sessions (
  id, organization_id, user_id, complex_id, completed_at, source
) VALUES (
  'c3000000-0000-4000-8000-00000000f1ff'::uuid, ${quoteLiteral(orgB)}::uuid,
  ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(complexOrgB)}::uuid, '2030-02-05 10:00+00', 'webapp'
);

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

\echo 'P2-C3 patient booking/LFK guards smoke: all assertions CONFIRMED.'
`;

try {
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);
  dbCreated = true;
  psql(
    [
      `CREATE ROLE ${ownerIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;`,
      '',
    ].join('\n'),
  );
  rolesCreated = true;

  console.log('--- p2-c3: applying protected context artifact ---');
  psqlFile(p2bSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });

  console.log('--- p2-c3: creating synthetic schema ---');
  psql(schemaSql);

  console.log('--- p2-c3: applying patient booking/LFK guard artifact ---');
  psqlFile(p2c3SqlPath, {
    p2_c3_staff_role: staffRole,
    p2_c3_patient_role: patientRole,
  });

  console.log('--- p2-c3: proving explicit C3 function grants under disposable app roles ---');
  psql(explicitGrantProofSql);

  console.log('--- p2-c3: proving patient booking/LFK value guards under disposable app roles ---');
  psql(proofSql);

  console.log(`smoke-p2-c3-patient-booking-lfk-guards: OK (${dbName})`);
} finally {
  if (dbCreated) {
    try {
      run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
    } catch (error) {
      console.error(
        `smoke-p2-c3-patient-booking-lfk-guards: cleanup dropdb failed: ${error.message}`,
      );
    }
  }
  if (rolesCreated) {
    try {
      run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], {
        input: [
          `DROP ROLE IF EXISTS ${patientIdent};`,
          `DROP ROLE IF EXISTS ${staffIdent};`,
          `DROP ROLE IF EXISTS ${ownerIdent};`,
          '',
        ].join('\n'),
      });
    } catch (error) {
      console.error(
        `smoke-p2-c3-patient-booking-lfk-guards: cleanup role drop failed: ${error.message}`,
      );
    }
  }
}
