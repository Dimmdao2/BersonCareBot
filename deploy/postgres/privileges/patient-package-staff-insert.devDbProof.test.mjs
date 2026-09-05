/**
 * Rollback-only proof for both staff sale paths on named DEV: the complete manual package chain
 * (package, items, history, activation) and the cash-ledger INSERT that settles the sale. Candidate
 * rights are installed and rolled back inside each transaction.
 *
 * Production Drizzle builds the package and payment statements so their named-column set cannot
 * drift from this proof. The chain-only relations ask live Drizzle metadata for their own named-column
 * set the same way (`liveInsertColumns` below, same technique as
 * `staff-drizzle-insert-grant-coverage.test.mjs`) — no committed scan artifact sits between the schema
 * and this proof. Revoking every named column in turn must produce PostgreSQL `42501`; this catches
 * both a half-created package and a payment that succeeded while the UI saw a privilege failure.
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
/** The relations the app_staff sale chain writes, in the order the flow writes them. */
const CHAIN_RELATIONS = [
  'public.be_patient_packages',
  'public.be_patient_package_items',
  'public.be_package_history_events',
];

const generatedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../generated/privileges.bcb_webapp_dev.sql',
);
const generatedText = fs.readFileSync(generatedPath, 'utf8');
const generatedLines = generatedText.split('\n');

function candidatePrivilegesFor(table) {
  const suffix = `ON TABLE "public"."${table}"`;
  const lines = generatedLines
    .filter(
      (line) => (line.startsWith('GRANT ') || line.startsWith('REVOKE ')) && line.includes(suffix),
    )
    .join('\n');
  assert.match(lines, /REVOKE ALL PRIVILEGES/u, table);
  assert.match(lines, /GRANT INSERT/u, table);
  return lines;
}

const packagePrivileges = candidatePrivilegesFor('be_patient_packages');
const paymentPrivileges = candidatePrivilegesFor('patient_payment');

const candidateChainPrivileges = generatedLines
  .filter(
    (line) =>
      (line.startsWith('GRANT ') || line.startsWith('REVOKE ')) &&
      CHAIN_RELATIONS.some((relation) =>
        line.includes(`ON TABLE "public"."${relation.slice('public.'.length)}"`),
      ),
  )
  .join('\n');

for (const relation of CHAIN_RELATIONS) {
  const table = relation.slice('public.'.length);
  assert.match(
    candidateChainPrivileges,
    new RegExp(`REVOKE ALL PRIVILEGES ON TABLE "public"\\."${table}"`, 'u'),
  );
  assert.match(
    candidateChainPrivileges,
    new RegExp(`GRANT INSERT \\([^)]*\\) ON TABLE "public"\\."${table}" TO "app_staff"`, 'u'),
  );
}

/** Schema export for each chain relation — all three live in the same booking-memberships module. */
const RELATION_SCHEMA = {
  'public.be_patient_packages': 'bePatientPackages',
  'public.be_patient_package_items': 'bePatientPackageItems',
  'public.be_package_history_events': 'bePackageHistoryEvents',
};
const RELATION_SCHEMA_MODULE = './db/schema/bookingMemberships.ts';

/**
 * The columns Drizzle itself names for an empty `.values({})` INSERT on this relation — asked of live
 * metadata, not a committed scan artifact, so this cannot drift from what production Drizzle actually
 * emits (same technique as `staff-drizzle-insert-grant-coverage.test.mjs`).
 */
const liveInsertColumnsCache = new Map();
function liveInsertColumns(relation) {
  if (liveInsertColumnsCache.has(relation)) return liveInsertColumnsCache.get(relation);
  const schemaExport = RELATION_SCHEMA[relation];
  const expression = [
    "import { drizzle } from 'drizzle-orm/pg-proxy'",
    `import { ${schemaExport} } from '${RELATION_SCHEMA_MODULE}'`,
    'const db = drizzle(async () => ({ rows: [] }))',
    `const { sql: text } = db.insert(${schemaExport}).values({}).toSQL()`,
    'const named = text.slice(text.indexOf("(") + 1, text.indexOf(") values"))',
    'process.stdout.write(JSON.stringify(named.split(",").map((c) => c.trim().replaceAll(String.fromCharCode(34), "")).sort()))',
  ].join(';');
  const columns = JSON.parse(
    execFileSync('node_modules/.bin/tsx', ['-e', expression], { cwd: WEBAPP_ROOT, encoding: 'utf8' }),
  );
  liveInsertColumnsCache.set(relation, columns);
  return columns;
}

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

/**
 * SQL value the production statement carries for each column Drizzle names. `default` mirrors a key
 * absent from `.values({...})`: Postgres checks INSERT privilege on the NAMED column either way.
 * `display_number` is the one exception — its default is `nextval()`, which a ROLLBACK does not undo,
 * so the proof passes a fixed high number instead of advancing the real sequence.
 */
const CHAIN_VALUES = {
  'public.be_patient_packages': {
    id: () => 'default',
    subscription_package_id: () => 'default',
    payment_intent_id: () => 'default',
    payment_ref: () => 'default',
    checkout_url: () => 'null',
    sale_idempotency_key: () => `'rollback-proof-sale-attempt'`,
    display_number: () => '2147483647',
    organization_id: (f) => `'${f.organizationId}'::uuid`,
    platform_user_id: (f) => `'${f.patientUserId}'::uuid`,
    assigned_by_platform_user_id: (f) => `'${f.staffUserId}'::uuid`,
    status: () => `'active'`,
    title: () => `'S1 rollback proof'`,
    price_minor: () => '0',
    currency: () => `'RUB'`,
    validity_days: () => 'null',
    valid_from: () => 'now()',
    valid_until: () => 'null',
    deduction_mode: () => `'auto_on_visit_confirmed'`,
    sold_at: () => 'now()',
    paid_amount_minor: () => '0',
    paid_currency: () => `'RUB'`,
    notes: () => `'rollback proof'`,
    created_at: () => 'now()',
    updated_at: () => 'now()',
  },
  'public.be_patient_package_items': {
    id: () => 'default',
    patient_package_id: () => `:'pkg_id'::uuid`,
    service_id: (f) => `'${f.serviceId}'::uuid`,
    quantity_initial: () => '1',
    sort_order: () => '0',
    created_at: () => 'now()',
  },
  'public.be_package_history_events': {
    id: () => 'default',
    organization_id: (f) => `'${f.organizationId}'::uuid`,
    patient_package_id: () => `:'pkg_id'::uuid`,
    event_type: (f, event) => `'${event}'`,
    payload_json: () => `'{}'::jsonb`,
    occurred_at: () => 'now()',
  },
};

function insertStatement(relation, fixtureRow, event) {
  const columns = liveInsertColumns(relation);
  const values = columns.map((column) => {
    const build = CHAIN_VALUES[relation][column];
    if (!build) {
      throw new Error(
        `${relation}.${column} is named by Drizzle but this proof has no value for it — add one, ` +
          'otherwise the chain would silently stop covering that column',
      );
    }
    return build(fixtureRow, event);
  });
  return `INSERT INTO ${relation}\n  (${columns.join(', ')})\nVALUES (${values.join(', ')})`;
}

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
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = membership.organization_id
        AND enrollment.status IN ('active', 'archived'))
    AND EXISTS (
      SELECT 1 FROM public.be_clinic_services AS service
      WHERE service.organization_id = membership.organization_id)
  ORDER BY membership.platform_user_id, membership.organization_id
  LIMIT 1
), patient AS (
  SELECT enrollment.platform_user_id
  FROM public.org_enrollments AS enrollment, actor
  WHERE enrollment.organization_id = actor.organization_id
    AND enrollment.status IN ('active', 'archived')
  ORDER BY enrollment.platform_user_id
  LIMIT 1
), service AS (
  SELECT service.id FROM public.be_clinic_services AS service, actor
  WHERE service.organization_id = actor.organization_id
  ORDER BY service.id
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
       || patient.platform_user_id || '|' || service.id || '|' || capability.capability_id || '|'
       || capability.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') || '|'
       || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ')
FROM actor, patient, service, capability;`);
  const values = output.split('|');
  assert.equal(values.length, 9, 'invalid patient-package write proof fixture');
  return {
    staffUserId: values[0],
    organizationId: values[1],
    actorRef: values[2],
    patientUserId: values[3],
    serviceId: values[4],
    capabilityId: values[5],
    login: values[6],
    argsHash: values[7],
    now: values[8],
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
    `const built = db.insert(${door.schemaExport})` +
      '.values(JSON.parse(process.env.BCB_STAFF_INSERT_PROOF_VALUES))' +
      `${door.conflict ?? ''}.returning().toSQL()`,
    'process.stdout.write(JSON.stringify(built))',
  ].join(';');
  const built = JSON.parse(
    execFileSync('node_modules/.bin/tsx', ['-e', expression], {
      cwd: WEBAPP_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        BCB_STAFF_INSERT_PROOF_VALUES: JSON.stringify(door.values(fixture())),
      },
    }),
  );
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

test(
  'candidate grant admits the production patient-package Drizzle statement',
  { skip: !ENABLED },
  () => {
    const f = fixture();
    const output = run(`BEGIN;
${packageSetup}
${installContext(f)}
${productionInsert('package').statement}
ROLLBACK;`);
    assert.match(output, /^[0-9a-f-]{36}\|/u);
  },
);

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

test(
  'candidate grant admits the production cash-ledger Drizzle statement',
  { skip: !ENABLED },
  () => {
    const f = fixture();
    const output = run(`BEGIN;
${paymentSetup}
${installContext(f)}
${productionInsert('payment').statement}
ROLLBACK;`);
    assert.match(output, /^[0-9a-f-]{36}\|/u);
  },
);

test(
  'cash-ledger proof turns red when any Drizzle-named column is missing',
  { skip: !ENABLED },
  () => {
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
  },
);

/** The five statements `createManualPatientPackage` executes as `app_staff`, in flow order. */
function saleChain(f) {
  return [
    `${insertStatement('public.be_patient_packages', f)} RETURNING id \\gset pkg_`,
    `${insertStatement('public.be_patient_package_items', f)};`,
    `${insertStatement('public.be_package_history_events', f, 'manual_created')};`,
    // setPatientPackageStatus(..., 'active', { paymentRef, validFrom, validUntil })
    `UPDATE public.be_patient_packages
        SET status = 'active', updated_at = now(), payment_ref = 'rollback proof',
            valid_from = now(), valid_until = null
      WHERE id = :'pkg_id'::uuid AND organization_id = '${f.organizationId}'::uuid;`,
    `${insertStatement('public.be_package_history_events', f, 'activated')};`,
  ].join('\n');
}

function chainTransaction(f, extraPrivilegeSql = '') {
  return `BEGIN;
${PENDING_MIGRATION_COLUMNS}
${candidateChainPrivileges}
${extraPrivilegeSql}
DELETE FROM public.be_patient_packages WHERE display_number = 2147483647;
${installContext(f)}
${saleChain(f)}
SELECT 'items=' || count(*) FROM public.be_patient_package_items
 WHERE patient_package_id = :'pkg_id'::uuid;
SELECT 'history=' || count(*) FROM public.be_package_history_events
 WHERE patient_package_id = :'pkg_id'::uuid;
ROLLBACK;`;
}

test(
  'the candidate grant admits the whole app_staff manual package-sale chain',
  { skip: !ENABLED },
  () => {
    const f = fixture();
    const output = run(chainTransaction(f));
    assert.match(output, /items=1/u, 'the package items statement did not write its row');
    assert.match(
      output,
      /history=2/u,
      'manual_created and activated history events did not both land',
    );
  },
);

test(
  'every column Drizzle names in the chain is load-bearing: revoke one and the flow dies 42501',
  { skip: !ENABLED },
  () => {
    const f = fixture();
    for (const relation of CHAIN_RELATIONS) {
      const table = relation.slice('public.'.length);
      for (const column of liveInsertColumns(relation)) {
        const error = failure(
          chainTransaction(f, `REVOKE INSERT (${column}) ON TABLE ${relation} FROM app_staff;`),
        );
        assert.match(
          error,
          new RegExp(`permission denied for table ${table}`, 'iu'),
          `${relation}.${column}`,
        );
      }
    }
  },
);

test(
  'the proof leaves no row and no privilege behind on the named DEV database',
  { skip: !ENABLED },
  () => {
    const leftover = run(`
SELECT 'packages=' || count(*) FROM public.be_patient_packages WHERE display_number = 2147483647;
SELECT 'contexts=' || count(*) FROM app_ext.accepted_port_contexts;
SELECT 'chain_privileges=' || coalesce(string_agg(privilege, ' ' ORDER BY privilege), '(none)')
  FROM (
    SELECT c.relname || ':' || att.attname AS privilege
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
      CROSS JOIN LATERAL aclexplode(att.attacl) a
     WHERE c.relname IN ('be_patient_package_items', 'be_package_history_events')
       AND a.grantee = 'app_staff'::regrole AND a.privilege_type = 'INSERT'
  ) granted;`);
    assert.match(leftover, /packages=0/u, 'the proof left a patient package behind');
    assert.match(leftover, /contexts=0/u, 'the proof left an accepted port context behind');
    assert.doesNotMatch(
      leftover,
      /be_patient_package_items:id|be_package_history_events:id/u,
      'the proof left the candidate INSERT grant installed on DEV — it must roll back',
    );
  },
);
