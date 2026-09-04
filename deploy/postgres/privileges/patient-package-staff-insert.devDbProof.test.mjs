/**
 * Rollback-only proof for the production Drizzle INSERT column lists a staff membership sale runs:
 * the patient package itself and the cash ledger row that settles it. Candidate rights come from
 * the generated declaration artifact and are reset inside every proof transaction. Opt-in: named
 * DEV only.
 *
 * PostgreSQL checks INSERT privilege on every NAMED column, whatever the value is, so a column the
 * production statement names and the declaration does not grant fails with `42501` on the first
 * live sale — after migration, reconcile and deploy have all gone green. That is why the enumerated
 * lists below are the production ones, copied column for column, and why every one of them is
 * revoked in turn to prove the wall is really load-bearing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PATIENT_PACKAGE_STAFF_INSERT_DB === '1';
const DATABASE = process.env.PATIENT_PACKAGE_STAFF_INSERT_PROOF_DB ?? 'bcb_webapp_dev';
if (DATABASE !== 'bcb_webapp_dev') {
  throw new Error('patient-package staff insert proof is restricted to bcb_webapp_dev');
}

const generatedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../generated/privileges.bcb_webapp_dev.sql',
);
const generated = fs.readFileSync(generatedPath, 'utf8');

function candidatePrivilegesFor(table) {
  const suffix = `ON TABLE "public"."${table}"`;
  const lines = generated
    .split('\n')
    .filter((line) => (line.startsWith('GRANT ') || line.startsWith('REVOKE ')) && line.includes(suffix))
    .join('\n');
  assert.match(lines, /REVOKE ALL PRIVILEGES/u, table);
  assert.match(lines, /GRANT INSERT/u, table);
  return lines;
}

const packagePrivileges = candidatePrivilegesFor('be_patient_packages');
const paymentPrivileges = candidatePrivilegesFor('patient_payment');

/**
 * The columns the pending migration adds. The proof states them itself so the candidate grant can
 * be installed and exercised before the migration is applied anywhere — the moment the answer is
 * still worth something. Rolled back with everything else.
 */
const PENDING_MIGRATION_COLUMNS = `ALTER TABLE public.be_patient_packages ADD COLUMN IF NOT EXISTS sale_idempotency_key text;
ALTER TABLE public.be_patient_packages ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.patient_payment ADD COLUMN IF NOT EXISTS patient_package_id uuid;`;

/** Named by Drizzle in the package INSERT with a DEFAULT rather than a value. */
const PACKAGE_DEFAULT_NAMED_COLUMNS = ['id', 'display_number', 'payment_intent_id', 'payment_ref'];
/** Named by Drizzle with a value; `sale_idempotency_key` is what this sale's identity rides on. */
const PACKAGE_VALUED_NAMED_COLUMNS = ['sale_idempotency_key'];
/**
 * The three cash-ledger columns the reused `addCashPayment` door names and the declaration did not
 * grant: without them a membership sale cannot write its cash at all, and neither can the
 * appointment cash contract MONEY-04 tells the sale to reuse.
 */
const PAYMENT_SUBJECT_COLUMNS = ['appointment_id', 'patient_package_id', 'idempotency_key'];

function run(sql) {
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
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

function failure(sql) {
  try {
    run(sql);
    assert.fail('SQL was expected to fail');
  } catch (error) {
    return String(error.stderr ?? error.message ?? '');
  }
}

function fixture() {
  const output = run(`
WITH actor AS (
  SELECT membership.platform_user_id, membership.organization_id, ref.opaque_ref
  FROM public.be_organization_members AS membership
  JOIN app_ext.variant_a_identity_refs AS ref
    ON ref.physical_user_id = membership.platform_user_id AND ref.ref_kind = 'actor'
  WHERE membership.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = membership.organization_id
        AND enrollment.status IN ('active', 'archived')
    )
  ORDER BY membership.platform_user_id, membership.organization_id
  LIMIT 1
), patient AS (
  SELECT enrollment.platform_user_id
  FROM public.org_enrollments AS enrollment, actor
  WHERE enrollment.organization_id = actor.organization_id
    AND enrollment.status IN ('active', 'archived')
  ORDER BY enrollment.platform_user_id
  LIMIT 1
), capability AS (
  SELECT capability_id, session_login
  FROM app_ext.port_context_capabilities
  WHERE context_class = 'staff' AND target_role = 'app_staff'
    AND purpose = 'relation' AND function_identity IS NULL
  ORDER BY session_login
  LIMIT 1
)
SELECT actor.platform_user_id || '|' || actor.organization_id || '|' || actor.opaque_ref || '|'
       || patient.platform_user_id || '|' || capability.capability_id || '|'
       || capability.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex')
FROM actor, patient, capability;`);
  const values = output.split('|');
  assert.equal(values.length, 7, 'invalid patient-package write proof fixture');
  return {
    staffUserId: values[0],
    organizationId: values[1],
    actorRef: values[2],
    patientUserId: values[3],
    capabilityId: values[4],
    login: values[5],
    argsHash: values[6],
  };
}

function installContext(f) {
  return `SET LOCAL SESSION AUTHORIZATION ${f.login};
SELECT app.begin_port_context(
  '${f.capabilityId}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${f.argsHash}', 'hex'), '${f.actorRef}'::uuid,
      NULL::uuid, '${f.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);`;
}

function productionColumnListInsert(f) {
  // A fixed high display number keeps the rollback proof from advancing the real sequence. The
  // named column — and therefore PostgreSQL's privilege check — is identical to Drizzle's DEFAULT.
  return `INSERT INTO public.be_patient_packages
    (id, organization_id, platform_user_id, subscription_package_id, status, display_number, title,
     price_minor, currency, validity_days, valid_from, valid_until, deduction_mode,
     payment_intent_id, payment_ref, sold_at, paid_amount_minor, paid_currency,
     assigned_by_platform_user_id, notes, sale_idempotency_key, created_at, updated_at)
  VALUES (default, '${f.organizationId}'::uuid, '${f.patientUserId}'::uuid, default, 'active',
          2147483647, 'Rollback proof', 0, 'RUB', null, now(), null, 'auto_on_visit_confirmed',
          default, default, now(), 0, 'RUB', '${f.staffUserId}'::uuid, 'rollback proof',
          'rollback-proof-sale-attempt', now(), now())
  RETURNING id;`;
}

/** `pgPatientPayments.addCashPayment` — the one cash door, column for column. */
function productionCashRowInsert(f) {
  return `INSERT INTO public.patient_payment
    (organization_id, patient_user_id, amount_minor, currency, kind, status, comment, service,
     visit_id, appointment_id, patient_package_id, idempotency_key, provider, provider_payment_id,
     created_by)
  VALUES ('${f.organizationId}'::uuid, '${f.patientUserId}'::uuid, 1, 'RUB', 'cash', 'paid',
          'rollback proof', 'Rollback proof', null, null, null, 'rollback-proof-cash', null, null,
          '${f.staffUserId}'::uuid)
  RETURNING id;`;
}

test('candidate grant admits the production patient-package Drizzle column list',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${PENDING_MIGRATION_COLUMNS}
${packagePrivileges}
DELETE FROM public.be_patient_packages WHERE display_number = 2147483647;
${installContext(f)}
${productionColumnListInsert(f)}
ROLLBACK;`);
  assert.match(output, /^[0-9a-f-]{36}$/u);
});

test('package proof turns red when any Drizzle-named column is missing', { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of [...PACKAGE_DEFAULT_NAMED_COLUMNS, ...PACKAGE_VALUED_NAMED_COLUMNS]) {
    const error = failure(`BEGIN;
${PENDING_MIGRATION_COLUMNS}
${packagePrivileges}
DELETE FROM public.be_patient_packages WHERE display_number = 2147483647;
REVOKE INSERT (${column}) ON TABLE public.be_patient_packages FROM app_staff;
${installContext(f)}
${productionColumnListInsert(f)}
ROLLBACK;`);
    assert.match(error, /permission denied for table be_patient_packages/iu, column);
  }
});

test('candidate grant admits the production cash-ledger Drizzle column list',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${PENDING_MIGRATION_COLUMNS}
${paymentPrivileges}
${installContext(f)}
${productionCashRowInsert(f)}
ROLLBACK;`);
  assert.match(output, /^[0-9a-f-]{36}$/u);
});

test('cash-ledger proof turns red when a subject or key column is missing',
  { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of PAYMENT_SUBJECT_COLUMNS) {
    const error = failure(`BEGIN;
${PENDING_MIGRATION_COLUMNS}
${paymentPrivileges}
REVOKE INSERT (${column}) ON TABLE public.patient_payment FROM app_staff;
${installContext(f)}
${productionCashRowInsert(f)}
ROLLBACK;`);
    assert.match(error, /permission denied for table patient_payment/iu, column);
  }
});
