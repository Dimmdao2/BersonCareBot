/**
 * Rollback-only proof for the production Drizzle INSERT statements a staff membership sale runs:
 * the patient package itself and the cash ledger row that settles it. Candidate rights come from
 * the generated declaration artifact and are reset inside every proof transaction. Opt-in: named
 * DEV only.
 *
 * PostgreSQL checks INSERT privilege on every NAMED column whatever the value is, and Drizzle names
 * every insertable column of the table — passing `default` for the ones the caller did not supply.
 * So a column the statement names and the declaration does not grant dies with `42501` on the first
 * live sale, after migration, reconcile and deploy have all gone green.
 *
 * Which is why this proof no longer restates those lists. It asks production Drizzle for the
 * statement itself (`db.insert(table).values({…}).toSQL()`), inlines its parameters, and then proves
 * every column that statement names load-bearing by revoking it in turn and demanding `42501`. A
 * list kept by hand here was a second declaration drifting silently from the first: it omitted
 * `patient_payment.id` and `patient_payment.created_at`, so this proof stayed green while the real
 * cash door was refused, and it omitted `be_patient_packages.checkout_url` on the package half.
 *
 * The static half of the same question — «does the declaration grant every column Drizzle names» —
 * is `staff-drizzle-insert-grant-coverage.test.mjs`, which needs no database. This file answers the
 * live half: that PostgreSQL itself accepts the statement under `app_staff`.
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

const WEBAPP_ROOT = fileURLToPath(new URL('../../../apps/webapp/', import.meta.url));

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

/**
 * The two staff doors under proof, each with the values its production caller supplies.
 * `pgMemberships.createManualPatientPackage` and `pgPatientPayments.addCashPayment` — the column
 * lists are Drizzle's, not ours.
 */
const DOORS = {
  package: {
    relation: 'be_patient_packages',
    schemaExport: 'bePatientPackages',
    schemaModule: './db/schema/bookingMemberships.ts',
    // A fixed high display number keeps the rollback proof from advancing the real sequence: the
    // column is named either way, and PostgreSQL's privilege check does not care about the value.
    values: (f) => ({
      organizationId: f.organizationId,
      platformUserId: f.patientUserId,
      status: 'active',
      displayNumber: 2147483647,
      title: 'Rollback proof',
      priceMinor: 0,
      currency: 'RUB',
      validityDays: null,
      validFrom: f.now,
      validUntil: null,
      deductionMode: 'auto_on_visit_confirmed',
      checkoutUrl: null,
      soldAt: f.now,
      paidAmountMinor: 0,
      paidCurrency: 'RUB',
      assignedByPlatformUserId: f.staffUserId,
      saleIdempotencyKey: 'rollback-proof-sale-attempt',
      notes: 'rollback proof',
    }),
  },
  payment: {
    relation: 'patient_payment',
    schemaExport: 'patientPayment',
    schemaModule: './db/schema/patientPayments.ts',
    values: (f) => ({
      organizationId: f.organizationId,
      patientUserId: f.patientUserId,
      amountMinor: 1,
      currency: 'RUB',
      kind: 'cash',
      status: 'paid',
      comment: 'rollback proof',
      service: 'Rollback proof',
      visitId: null,
      appointmentId: null,
      patientPackageId: null,
      idempotencyKey: 'rollback-proof-cash',
      provider: null,
      providerPaymentId: null,
      createdBy: f.staffUserId,
    }),
    // `addCashPayment` carries this on the real door; two partial unique indexes sit behind it.
    conflict: '.onConflictDoNothing()',
  },
};

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

function loadFixture() {
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
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') || '|'
       || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ')
FROM actor, patient, capability;`);
  const values = output.split('|');
  assert.equal(values.length, 8, 'invalid patient-package write proof fixture');
  return {
    staffUserId: values[0],
    organizationId: values[1],
    actorRef: values[2],
    patientUserId: values[3],
    capabilityId: values[4],
    login: values[5],
    argsHash: values[6],
    now: values[7],
  };
}

let fixtureCache = null;
function fixture() {
  fixtureCache ??= loadFixture();
  return fixtureCache;
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

function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Ask production Drizzle for the statement, parameters and all, instead of restating it here. */
function buildInsert(door) {
  const expression = [
    "import { drizzle } from 'drizzle-orm/pg-proxy'",
    `import { ${door.schemaExport} } from '${door.schemaModule}'`,
    'const db = drizzle(async () => ({ rows: [] }))',
    `const built = db.insert(${door.schemaExport})`
      + '.values(JSON.parse(process.env.BCB_STAFF_INSERT_PROOF_VALUES))'
      + `${door.conflict ?? ''}.returning().toSQL()`,
    'process.stdout.write(JSON.stringify(built))',
  ].join(';');
  const built = JSON.parse(execFileSync('node_modules/.bin/tsx', ['-e', expression], {
    cwd: WEBAPP_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      BCB_STAFF_INSERT_PROOF_VALUES: JSON.stringify(door.values(fixture())),
    },
  }));
  const named = built.sql.slice(built.sql.indexOf('(') + 1, built.sql.indexOf(') values'));
  return {
    columns: named.split(',').map((column) => column.trim().replaceAll('"', '')),
    // Drizzle emits the relation unqualified; the harness runs outside the app's search_path, so
    // the one token is qualified here. Nothing else about the statement is rewritten.
    statement: `${built.sql
      .replace(`insert into "${door.relation}"`, `insert into "public"."${door.relation}"`)
      .replace(/\$(\d+)/gu, (_match, index) => literal(built.params[Number(index) - 1]))};`,
  };
}

const insertCache = new Map();
function productionInsert(key) {
  if (!insertCache.has(key)) insertCache.set(key, buildInsert(DOORS[key]));
  return insertCache.get(key);
}

/** Everything the package probe needs before the statement: pending columns, grant, clean slate. */
const packageSetup = `${PENDING_MIGRATION_COLUMNS}
${packagePrivileges}
DELETE FROM public.be_patient_packages WHERE display_number = 2147483647;`;

const paymentSetup = `${PENDING_MIGRATION_COLUMNS}
${paymentPrivileges}`;

test('candidate grant admits the production patient-package Drizzle statement',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${packageSetup}
${installContext(f)}
${productionInsert('package').statement}
ROLLBACK;`);
  assert.match(output, /^[0-9a-f-]{36}\|/u);
});

test('package proof turns red when any Drizzle-named column is missing', { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of productionInsert('package').columns) {
    const error = failure(`BEGIN;
${packageSetup}
REVOKE INSERT (${column}) ON TABLE public.be_patient_packages FROM app_staff;
${installContext(f)}
${productionInsert('package').statement}
ROLLBACK;`);
    assert.match(error, /permission denied for table be_patient_packages/iu, column);
  }
});

test('candidate grant admits the production cash-ledger Drizzle statement',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${paymentSetup}
${installContext(f)}
${productionInsert('payment').statement}
ROLLBACK;`);
  assert.match(output, /^[0-9a-f-]{36}\|/u);
});

test('cash-ledger proof turns red when any Drizzle-named column is missing',
  { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of productionInsert('payment').columns) {
    const error = failure(`BEGIN;
${paymentSetup}
REVOKE INSERT (${column}) ON TABLE public.patient_payment FROM app_staff;
${installContext(f)}
${productionInsert('payment').statement}
ROLLBACK;`);
    assert.match(error, /permission denied for table patient_payment/iu, column);
  }
});
