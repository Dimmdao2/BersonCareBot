/**
 * Rollback-only proof, on the named DEV database, that the candidate privilege declaration admits
 * the WHOLE manual package-sale chain the webapp runs as `app_staff` — not just its first INSERT.
 *
 * Named breakage this catches (§10a): staff presses «продать абонемент»; the parent row is written,
 * and the next statement of the same flow dies with
 * `42501 permission denied for table be_patient_package_items` because the column grant omits a
 * column Drizzle NAMES. The package is left half-created — the outcome R1 calls worse than the
 * failure it replaces, because parent+items and history+activation are separate transactions.
 *
 * Why the whole chain and not one INSERT: `createManualPatientPackage`
 * (`apps/webapp/src/modules/memberships/service.ts:217`) runs, as `app_staff`,
 *
 *   1. INSERT public.be_patient_packages          (`infra/repos/pgMemberships.ts:475`)
 *   2. INSERT public.be_patient_package_items     (`infra/repos/pgMemberships.ts:501`)
 *   3. INSERT public.be_package_history_events    `manual_created` (`pgMemberships.ts:901`)
 *   4. UPDATE public.be_patient_packages          activation (`pgMemberships.ts:736`)
 *   5. INSERT public.be_package_history_events    `activated` (`pgMemberships.ts:901`)
 *
 * `be_patient_packages` was ALREADY granted `id` before S1, so a proof that stops after step 1 is
 * green while the product is broken — that is exactly the state the earlier revision of this file
 * was in. The payment-intent write of the "send for payment" branch is deliberately NOT here: the
 * production path routes it through `runWithDbOrganizationPrincipal`
 * (`infra/repos/pgPayments.ts:154`), i.e. NOT as `app_staff`, and that principal is R2/S2's subject.
 *
 * The statements are not hand-written column lists: every INSERT is built from
 * `drizzle-insert-surface.ts`, the same machine-owned artifact the declaration reads, so a schema
 * column added tomorrow enters this proof automatically (and a column with no value here fails the
 * proof loudly instead of dropping out of it).
 *
 * Candidate rights are applied INSIDE each proof transaction and rolled back with it; the installed
 * DEV grant is never changed. Opt-in, named DEV only:
 *
 *   RUN_PATIENT_PACKAGE_STAFF_INSERT_DB=1 node --test \
 *     deploy/postgres/privileges/patient-package-staff-insert.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DRIZZLE_INSERT_SURFACE } from './drizzle-insert-surface.ts';

const ENABLED = process.env.RUN_PATIENT_PACKAGE_STAFF_INSERT_DB === '1';
const DATABASE = process.env.PATIENT_PACKAGE_STAFF_INSERT_PROOF_DB ?? 'bcb_webapp_dev';
if (DATABASE !== 'bcb_webapp_dev') {
  throw new Error('patient-package staff insert proof is restricted to bcb_webapp_dev');
}

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
const generated = fs.readFileSync(generatedPath, 'utf8').split('\n');

/** Exactly the candidate table-privilege statements for the chain, in generated order. */
const candidatePrivileges = generated
  .filter((line) =>
    (line.startsWith('GRANT ') || line.startsWith('REVOKE '))
    && CHAIN_RELATIONS.some((relation) =>
      line.includes(`ON TABLE "public"."${relation.slice('public.'.length)}"`)))
  .join('\n');

for (const relation of CHAIN_RELATIONS) {
  const table = relation.slice('public.'.length);
  assert.match(candidatePrivileges, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE "public"\\."${table}"`, 'u'));
  assert.match(candidatePrivileges, new RegExp(`GRANT INSERT \\([^)]*\\) ON TABLE "public"\\."${table}" TO "app_staff"`, 'u'));
  assert.ok(
    (DRIZZLE_INSERT_SURFACE[relation]?.directInsertCallsites.length ?? 0) > 0,
    `${relation} lost its direct Drizzle .insert() callsite — this proof no longer covers the flow`,
  );
}

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
  const columns = DRIZZLE_INSERT_SURFACE[relation].insertColumns;
  const values = columns.map((column) => {
    const build = CHAIN_VALUES[relation][column];
    if (!build) {
      throw new Error(
        `${relation}.${column} is named by Drizzle but this proof has no value for it — add one, `
          + 'otherwise the chain would silently stop covering that column',
      );
    }
    return build(fixtureRow, event);
  });
  return `INSERT INTO ${relation}\n  (${columns.join(', ')})\nVALUES (${values.join(', ')})`;
}

function run(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q', '-h', '/var/run/postgresql',
      '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
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

/**
 * A live staff actor, a patient enrolled in the same organization and a clinic service of that
 * organization — the row-level policies of the chain require all three, so a proof without them
 * would pass the privilege check and die on RLS instead.
 */
function fixture() {
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
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex')
FROM actor, patient, service, capability;`);
  const values = output.split('|');
  assert.equal(values.length, 8, 'invalid patient-package write proof fixture');
  return {
    staffUserId: values[0],
    organizationId: values[1],
    actorRef: values[2],
    patientUserId: values[3],
    serviceId: values[4],
    capabilityId: values[5],
    login: values[6],
    argsHash: values[7],
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
${candidatePrivileges}
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

test('the candidate grant admits the whole app_staff manual package-sale chain',
  { skip: !ENABLED }, () => {
    const f = fixture();
    const output = run(chainTransaction(f));
    assert.match(output, /items=1/u, 'the package items statement did not write its row');
    assert.match(output, /history=2/u, 'manual_created and activated history events did not both land');
  });

test('every column Drizzle names in the chain is load-bearing: revoke one and the flow dies 42501',
  { skip: !ENABLED }, () => {
    const f = fixture();
    for (const relation of CHAIN_RELATIONS) {
      const table = relation.slice('public.'.length);
      for (const column of DRIZZLE_INSERT_SURFACE[relation].insertColumns) {
        const error = failure(chainTransaction(
          f,
          `REVOKE INSERT (${column}) ON TABLE ${relation} FROM app_staff;`,
        ));
        assert.match(
          error,
          new RegExp(`permission denied for table ${table}`, 'iu'),
          `${relation}.${column}`,
        );
      }
    }
  });

test('the proof leaves no row and no privilege behind on the named DEV database',
  { skip: !ENABLED }, () => {
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
  });
