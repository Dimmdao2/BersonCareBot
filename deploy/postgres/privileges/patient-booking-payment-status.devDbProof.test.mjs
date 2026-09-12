/**
 * Rollback-only S9 proof against the named DEV database.
 *
 * Expensive silent failures:
 *   1. The authenticated patient payment-status door cannot execute, so every unpaid booking
 *      hides its amount and deadline behind a generic load error.
 *   2. Removing the identity predicate lets one patient read another patient's payment state.
 *
 * Run:
 *   RUN_PATIENT_BOOKING_PAYMENT_STATUS_DB=1 node --test \
 *     deploy/postgres/privileges/patient-booking-payment-status.devDbProof.test.mjs
 * Fault injection (each command must fail):
 *   PATIENT_BOOKING_PAYMENT_STATUS_FAULT=deny_execute ...
 *   PATIENT_BOOKING_PAYMENT_STATUS_FAULT=omit_identity_filter ...
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PATIENT_BOOKING_PAYMENT_STATUS_DB === '1';
const FAULT = process.env.PATIENT_BOOKING_PAYMENT_STATUS_FAULT ?? '';
const DATABASE = process.env.PATIENT_BOOKING_PAYMENT_STATUS_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!/_dev$|_test$/u.test(DATABASE)) {
  throw new Error(`refusing to probe non dev/test database '${DATABASE}'`);
}
if (!['', 'deny_execute', 'omit_identity_filter'].includes(FAULT)) {
  throw new Error(`unknown PATIENT_BOOKING_PAYMENT_STATUS_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const migrationPath = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260911T233000_patient_reads_own_booking_payment_status.sql',
);
const privilegesPath = path.join(
  repoRoot,
  'deploy/postgres/generated',
  `privileges.${DATABASE}.sql`,
);
const capabilitiesPath = path.join(
  repoRoot,
  'deploy/postgres/generated',
  `port-context-capabilities.${DATABASE}.sql`,
);

const identity = 'app.read_current_patient_booking_payment_status(uuid)';
const seamOwner = 'app_seam_patient_booking_owner';
const identityPredicate = 'AND booking.platform_user_id = v_patient';

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n',
      '-u',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-q',
      '-h',
      '/var/run/postgresql',
      '-p',
      '5432',
      '-d',
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

function candidateFunction() {
  const source = fs.readFileSync(migrationPath, 'utf8');
  if (FAULT !== 'omit_identity_filter') return source;
  const at = source.lastIndexOf(identityPredicate);
  assert.ok(at >= 0, 'identity predicate to fault-inject was not found');
  return `${source.slice(0, at)}AND TRUE${source.slice(at + identityPredicate.length)}`;
}

function generatedPrivilegeLines() {
  const lines = fs.readFileSync(privilegesPath, 'utf8').split('\n');
  const relations = [
    'patient_bookings',
    'be_appointments',
    'be_payments',
    'be_payment_intents',
  ];
  const grants = relations.map((relation) => {
    const line = lines.find(
      (candidate) =>
        candidate.startsWith('GRANT SELECT ') &&
        candidate.includes(` ON TABLE "public"."${relation}" TO "${seamOwner}";`),
    );
    assert.ok(line, `generated SELECT grant is missing for ${relation}`);
    return line;
  });
  const execute = lines.find(
    (line) =>
      line === `GRANT EXECUTE ON FUNCTION ${identity} TO "app_patient";`,
  );
  assert.ok(execute, 'generated patient EXECUTE grant is missing');
  return { grants, execute };
}

function generatedCapability() {
  const line = fs
    .readFileSync(capabilitiesPath, 'utf8')
    .split('\n')
    .find((candidate) => candidate.includes(`'${identity}'::regprocedure`));
  assert.ok(line, 'generated patient payment-status capability is missing');
  const values = line.trim().replace(/,$/u, '');
  const id = /^\('([0-9a-f-]{36})'/u.exec(values)?.[1];
  const login = /'([a-z][a-z0-9_]+)'::name, 'app_patient'::name/u.exec(values)?.[1];
  assert.match(id ?? '', /^[0-9a-f-]{36}$/u, 'capability id');
  assert.match(login ?? '', /^[a-z][a-z0-9_]+$/u, 'patient login');
  return { values, id, login };
}

function installCandidate() {
  if (FAULT === '') return '';
  if (FAULT === 'deny_execute') {
    return `REVOKE EXECUTE ON FUNCTION ${identity} FROM app_patient;`;
  }
  const { grants, execute } = generatedPrivilegeLines();
  const capability = generatedCapability();
  return `
GRANT CREATE ON SCHEMA app TO ${seamOwner};
GRANT USAGE ON LANGUAGE plpgsql TO ${seamOwner};
SET LOCAL ROLE ${seamOwner};
${candidateFunction()}
RESET ROLE;
${grants.join('\n')}
${execute}
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES ${capability.values}
ON CONFLICT (capability_id) DO UPDATE SET
  port = EXCLUDED.port,
  session_login = EXCLUDED.session_login,
  target_role = EXCLUDED.target_role,
  context_class = EXCLUDED.context_class,
  purpose = EXCLUDED.purpose,
  function_identity = EXCLUDED.function_identity;
`;
}

function installPatientContext(target) {
  const capability = generatedCapability();
  return `
SET LOCAL SESSION AUTHORIZATION "${capability.login}";
SELECT app.begin_port_context('${capability.id}'::uuid, ROW(
  1::smallint,
  'patient'::app.port_context_class,
  'app_patient'::name,
  'booking.patient-payment-status.read',
  '${identity}'::regprocedure,
  (SELECT ${target}_args_hash FROM s9_fixture),
  (SELECT owner_actor_ref FROM s9_fixture),
  (SELECT owner_subject_ref FROM s9_fixture),
  NULL::uuid,
  NULL::bigint,
  NULL::uuid
)::app.port_context_claims);
`;
}

function fixture() {
  return `
CREATE TEMP TABLE s9_fixture AS
SELECT booking.id AS booking_id,
       appointment.id AS appointment_id,
       booking.organization_id,
       booking.platform_user_id AS owner_user_id,
       owner_actor.opaque_ref AS owner_actor_ref,
       owner_subject.opaque_ref AS owner_subject_ref,
       app.hash_port_typed_args(ARRAY[
         ROW('uuid@1', pg_catalog.uuid_send(booking.id))::app.port_typed_arg
       ]) AS owner_args_hash,
       foreign_booking.booking_id AS foreign_booking_id,
       foreign_booking.appointment_id AS foreign_appointment_id,
       foreign_booking.organization_id AS foreign_organization_id,
       foreign_booking.platform_user_id AS foreign_user_id,
       app.hash_port_typed_args(ARRAY[
         ROW('uuid@1', pg_catalog.uuid_send(foreign_booking.booking_id))::app.port_typed_arg
       ]) AS foreign_args_hash
FROM public.patient_bookings AS booking
JOIN public.be_appointments AS appointment
  ON appointment.id = booking.canonical_appointment_id
 AND appointment.organization_id = booking.organization_id
 AND appointment.platform_user_id = booking.platform_user_id
JOIN app_ext.variant_a_identity_refs AS owner_actor
  ON owner_actor.physical_user_id = booking.platform_user_id
 AND owner_actor.ref_kind = 'actor'
JOIN app_ext.variant_a_identity_refs AS owner_subject
  ON owner_subject.physical_user_id = booking.platform_user_id
 AND owner_subject.ref_kind = 'subject'
JOIN LATERAL (
  SELECT other_booking.id AS booking_id,
         other_appointment.id AS appointment_id,
         other_booking.organization_id,
         other_booking.platform_user_id
  FROM public.patient_bookings AS other_booking
  JOIN public.be_appointments AS other_appointment
    ON other_appointment.id = other_booking.canonical_appointment_id
   AND other_appointment.organization_id = other_booking.organization_id
   AND other_appointment.platform_user_id = other_booking.platform_user_id
  WHERE other_booking.platform_user_id <> booking.platform_user_id
  ORDER BY other_booking.created_at DESC
  LIMIT 1
) AS foreign_booking ON true
WHERE booking.organization_id IS NOT NULL
ORDER BY booking.created_at DESC
LIMIT 1;

DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM s9_fixture) THEN
    RAISE EXCEPTION 'named DEV needs a linked booking plus two patient identities for S9 proof';
  END IF;
END
$fixture$;

GRANT SELECT ON s9_fixture TO "${generatedCapability().login}", app_patient;

UPDATE public.be_appointments
SET status = 'awaiting_payment',
    specialist_id = NULL,
    room_id = NULL,
    payment_ref = NULL,
    payment_deadline_at = pg_catalog.clock_timestamp() + interval '45 minutes'
WHERE id IN (
  SELECT appointment_id FROM s9_fixture
  UNION ALL
  SELECT foreign_appointment_id FROM s9_fixture
);

UPDATE public.patient_bookings
SET status = 'awaiting_payment'
WHERE id IN (
  SELECT booking_id FROM s9_fixture
  UNION ALL
  SELECT foreign_booking_id FROM s9_fixture
);

INSERT INTO public.be_payment_intents (
  id, organization_id, idempotency_key, provider_id, appointment_id, platform_user_id,
  amount_minor, currency, status, purpose, provider_intent_ref, checkout_url
)
SELECT '00000000-0000-4000-8000-0000000009f9'::uuid,
       organization_id,
       's9-rollback-proof',
       's9-proof',
       appointment_id,
       owner_user_id,
       123456,
       'RUB',
       'pending',
       'appointment_prepayment',
       's9-proof-provider-ref',
       'https://provider.invalid/must-not-cross-root'
FROM s9_fixture;

INSERT INTO public.be_payment_intents (
  id, organization_id, idempotency_key, provider_id, appointment_id, platform_user_id,
  amount_minor, currency, status, purpose, provider_intent_ref, checkout_url
)
SELECT '00000000-0000-4000-8000-0000000009f8'::uuid,
       foreign_organization_id,
       's9-rollback-proof-foreign',
       's9-proof',
       foreign_appointment_id,
       foreign_user_id,
       654321,
       'RUB',
       'pending',
       'appointment_prepayment',
       's9-proof-provider-ref-foreign',
       'https://provider.invalid/must-not-cross-root'
FROM s9_fixture;
`;
}

function runOwnerCall() {
  return psql(`
BEGIN;
${installCandidate()}
${fixture()}
${installPatientContext('owner')}
SELECT pg_catalog.jsonb_build_object(
  'intentId', status.intent_id,
  'amountMinor', status.amount_minor,
  'currency', status.currency,
  'intentStatus', status.intent_status,
  'checkoutIntentId', status.checkout_intent_id,
  'deadlinePresent', status.payment_deadline_at IS NOT NULL,
  'appointmentStatus', status.appointment_status
)::text
FROM app.read_current_patient_booking_payment_status(
  (SELECT booking_id FROM s9_fixture)
) AS status;
ROLLBACK;
`)
    .split('\n')
    .filter(Boolean)
    .at(-1);
}

function runForeignCall() {
  return psql(`
BEGIN;
${installCandidate()}
${fixture()}
${installPatientContext('foreign')}
SELECT count(*)::text
FROM app.read_current_patient_booking_payment_status(
  (SELECT foreign_booking_id FROM s9_fixture)
);
ROLLBACK;
`)
    .split('\n')
    .filter(Boolean)
    .at(-1);
}

test(
  'the patient payment-status root answers with the exact payable projection',
  { skip: !ENABLED || FAULT === 'omit_identity_filter', concurrency: false },
  () => {
    const line = runOwnerCall();
    assert.ok(line, 'patient payment-status root returned no row');
    assert.deepEqual(JSON.parse(line), {
      intentId: '00000000-0000-4000-8000-0000000009f9',
      amountMinor: 123456,
      currency: 'RUB',
      intentStatus: 'pending',
      checkoutIntentId: '00000000-0000-4000-8000-0000000009f9',
      deadlinePresent: true,
      appointmentStatus: 'awaiting_payment',
    });
  },
);

test(
  "the same payment-status root returns no row for another patient's identity",
  { skip: !ENABLED || FAULT === 'deny_execute', concurrency: false },
  () => {
    assert.equal(runForeignCall(), '0');
  },
);
