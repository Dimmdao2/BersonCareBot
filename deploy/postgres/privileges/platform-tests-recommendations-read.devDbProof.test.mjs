/**
 * Live proof for EXERCISE_STORE_PLAN S0б on the named DEV database.
 *
 * Named silent failures:
 * - staff loses its clinic rows or the platform tests/recommendations family;
 * - staff sees another clinic's rows;
 * - staff creates, updates, or deletes the platform layer;
 * - an invalid owner_kind/organization_id pair reaches storage;
 * - a role member other than the narrowed app_staff runtime role gains platform reads.
 *
 * The oracle is the owner plan, not declaration.ts. Until the declaration can be reconciled,
 * the four declared SELECT policies are recreated by exact name inside every transaction and
 * rolled back with the non-empty fixtures. S0B_PLATFORM_POLICY_FAULT is audit-only fault
 * injection; production execution must leave it unset.
 *
 * Run:
 *   RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test \
 *     deploy/postgres/privileges/platform-tests-recommendations-read.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

const ENABLED = process.env.RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB === '1';
const DATABASE = process.env.PLATFORM_TESTS_RECOMMENDATIONS_READ_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.S0B_PLATFORM_POLICY_FAULT ?? 'none';
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ALLOWED_FAULTS = new Set(['none', 'using_true', 'for_all', 'omit_org_null', 'omit_current_user']);

if (DATABASE !== 'bcb_webapp_dev') {
  throw new Error(`S0б live proof refuses non-DEV database '${DATABASE}'`);
}
if (!ALLOWED_FAULTS.has(FAULT)) throw new Error(`unknown S0б policy fault '${FAULT}'`);

function psql(sql, { expectFailure = false } = {}) {
  const result = spawnSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    {
      input: `\\set VERBOSITY verbose\n${sql}\n`,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  if (result.error) throw result.error;
  const outcome = {
    failed: result.status !== 0,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  };
  if (expectFailure !== null && outcome.failed !== expectFailure) {
    throw new Error(`unexpected psql outcome (${result.status}):\n${outcome.stderr}\n${outcome.stdout}`);
  }
  return outcome;
}

function rows(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('|'));
}

function markers(output) {
  return new Map(rows(output)
    .filter(([label]) => label.startsWith('PROOF_'))
    .map(([label, ...values]) => [label, values.join('|')]));
}

function sqlState(outcome) {
  return /SQL state:\s*([0-9A-Z]{5})/u.exec(outcome.stderr)?.[1]
    ?? /ERROR:\s*([0-9A-Z]{5}):/u.exec(outcome.stderr)?.[1]
    ?? null;
}

function checkedIdentifier(value, label) {
  assert.match(value, IDENTIFIER, `${label} must be a safe PostgreSQL identifier`);
  return value;
}

function checkedUuid(value, label) {
  assert.match(value, UUID, `${label} must be a UUID`);
  return value;
}

function runtimeContext() {
  const output = psql(`
SELECT m.organization_id::text || '|' || refs.opaque_ref::text || '|'
       || staff.capability_id::text || '|' || staff.session_login || '|'
       || staff.port::text || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') || '|'
       || region.id::text
  FROM public.be_organization_members m
  JOIN app_ext.variant_a_identity_refs refs
    ON refs.physical_user_id = m.platform_user_id AND refs.ref_kind = 'actor'
  CROSS JOIN LATERAL (
    SELECT capability_id, session_login, port
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'staff' AND target_role = 'app_staff'
       AND purpose = 'relation' AND function_identity IS NULL
     ORDER BY session_login LIMIT 1
  ) staff
  CROSS JOIN LATERAL (SELECT id FROM public.reference_items ORDER BY id LIMIT 1) region
 WHERE m.status = 'active'
 ORDER BY m.organization_id
 LIMIT 1;`).stdout;
  const [[organizationId, actorRef, capabilityId, staffLogin, port, argsHash, regionId] = []]
    = rows(output);
  assert.ok(regionId, `${DATABASE}: runtime context fixture is unavailable`);
  assert.match(argsHash, /^[0-9a-f]{64}$/u, 'typed args hash must be a SHA-256 hex value');
  return {
    organizationId: checkedUuid(organizationId, 'organization'),
    actorRef: checkedUuid(actorRef, 'actor ref'),
    capabilityId: checkedUuid(capabilityId, 'capability'),
    staffLogin: checkedIdentifier(staffLogin, 'staff login'),
    port: checkedIdentifier(port, 'port'),
    argsHash,
    regionId: checkedUuid(regionId, 'region'),
  };
}

const ids = {
  foreignOrganization: randomUUID(),
  platformTest: randomUUID(),
  platformTestForInsert: randomUUID(),
  ownTest: randomUUID(),
  foreignTest: randomUUID(),
  platformRecommendation: randomUUID(),
  platformRecommendationForInsert: randomUUID(),
  ownRecommendation: randomUUID(),
  foreignRecommendation: randomUUID(),
  invalidWrite: randomUUID(),
  corruptPlatformTest: randomUUID(),
  temporaryCapability: randomUUID(),
};

const policyNames = [
  ['clinical_test_regions', 'rev10_platform_lfk_read_76'],
  ['recommendation_regions', 'rev10_platform_lfk_read_163'],
  ['recommendations', 'rev10_platform_lfk_read_164'],
  ['tests', 'rev10_platform_lfk_read_205'],
];

function platformPredicate(table) {
  if (table !== 'tests') {
    return `(current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL`
      + ` AND owner_kind = 'platform' AND organization_id IS NULL)`;
  }
  if (FAULT === 'using_true') return 'true';
  return `(${FAULT === 'omit_current_user' ? '' : "current_user = 'app_staff'::name AND "}`
    + `(SELECT app.current_org_id()) IS NOT NULL AND owner_kind = 'platform'`
    + `${FAULT === 'omit_org_null' ? '' : ' AND organization_id IS NULL'})`;
}

function installPoliciesSql() {
  return policyNames.map(([table, name]) => {
    const command = table === 'tests' && FAULT === 'for_all' ? 'ALL' : 'SELECT';
    return `DROP POLICY IF EXISTS ${name} ON public.${table};\n`
      + `CREATE POLICY ${name} ON public.${table} AS PERMISSIVE FOR ${command} TO app_staff`
      + ` USING (${platformPredicate(table)});`;
  }).join('\n');
}

function fixtureSql(context) {
  return `
INSERT INTO public.be_organizations (id, title)
VALUES ('${ids.foreignOrganization}'::uuid, 'S0б rollback-only foreign clinic');
INSERT INTO public.tests (id, owner_kind, organization_id, title)
VALUES
  ('${ids.platformTest}'::uuid, 'platform', NULL, 'S0б platform test'),
  ('${ids.platformTestForInsert}'::uuid, 'platform', NULL, 'S0б platform insert parent'),
  ('${ids.ownTest}'::uuid, 'organization', '${context.organizationId}'::uuid, 'S0б own test'),
  ('${ids.foreignTest}'::uuid, 'organization', '${ids.foreignOrganization}'::uuid, 'S0б foreign test');
INSERT INTO public.recommendations (id, owner_kind, organization_id, title, body_md)
VALUES
  ('${ids.platformRecommendation}'::uuid, 'platform', NULL, 'S0б platform recommendation', 'proof'),
  ('${ids.platformRecommendationForInsert}'::uuid, 'platform', NULL, 'S0б platform insert parent', 'proof'),
  ('${ids.ownRecommendation}'::uuid, 'organization', '${context.organizationId}'::uuid,
   'S0б own recommendation', 'proof'),
  ('${ids.foreignRecommendation}'::uuid, 'organization', '${ids.foreignOrganization}'::uuid,
   'S0б foreign recommendation', 'proof');
INSERT INTO public.clinical_test_regions
  (clinical_test_id, body_region_id, owner_kind, organization_id)
VALUES
  ('${ids.platformTest}'::uuid, '${context.regionId}'::uuid, 'platform', NULL),
  ('${ids.ownTest}'::uuid, '${context.regionId}'::uuid, 'organization', '${context.organizationId}'::uuid),
  ('${ids.foreignTest}'::uuid, '${context.regionId}'::uuid,
   'organization', '${ids.foreignOrganization}'::uuid);
INSERT INTO public.recommendation_regions
  (recommendation_id, body_region_id, owner_kind, organization_id)
VALUES
  ('${ids.platformRecommendation}'::uuid, '${context.regionId}'::uuid, 'platform', NULL),
  ('${ids.ownRecommendation}'::uuid, '${context.regionId}'::uuid,
   'organization', '${context.organizationId}'::uuid),
  ('${ids.foreignRecommendation}'::uuid, '${context.regionId}'::uuid,
   'organization', '${ids.foreignOrganization}'::uuid);`;
}

function installStaffContext(context) {
  return `
SET LOCAL SESSION AUTHORIZATION ${context.staffLogin};
SELECT app.begin_port_context(
  '${context.capabilityId}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${context.argsHash}', 'hex'), '${context.actorRef}'::uuid,
      NULL::uuid, '${context.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);`;
}

let context;
let initialPolicyCount;
function preparedContext() {
  context ??= runtimeContext();
  initialPolicyCount ??= Number.parseInt(psql(`
SELECT count(*) FROM pg_policy
 WHERE polname IN ('rev10_platform_lfk_read_76', 'rev10_platform_lfk_read_163',
                   'rev10_platform_lfk_read_164', 'rev10_platform_lfk_read_205');`).stdout, 10);
  return context;
}

test('owner CHECK rejects both invalid ownership pairs on all four relations', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const attempts = [
    ['tests platform/non-null', `INSERT INTO public.tests(id, owner_kind, organization_id, title)
      VALUES ('${ids.invalidWrite}', 'platform', '${ctx.organizationId}', 'forbidden')`],
    ['tests organization/null', `INSERT INTO public.tests(id, owner_kind, organization_id, title)
      VALUES ('${ids.invalidWrite}', 'organization', NULL, 'forbidden')`],
    ['recommendations platform/non-null', `INSERT INTO public.recommendations
      (id, owner_kind, organization_id, title, body_md)
      VALUES ('${ids.invalidWrite}', 'platform', '${ctx.organizationId}', 'forbidden', 'proof')`],
    ['recommendations organization/null', `INSERT INTO public.recommendations
      (id, owner_kind, organization_id, title, body_md)
      VALUES ('${ids.invalidWrite}', 'organization', NULL, 'forbidden', 'proof')`],
    ['clinical_test_regions platform/non-null', `${fixtureSql(ctx)}
      INSERT INTO public.clinical_test_regions
      (clinical_test_id, body_region_id, owner_kind, organization_id)
      VALUES ('${ids.platformTestForInsert}', '${ctx.regionId}', 'platform', '${ctx.organizationId}')`],
    ['clinical_test_regions organization/null', `${fixtureSql(ctx)}
      INSERT INTO public.clinical_test_regions
      (clinical_test_id, body_region_id, owner_kind, organization_id)
      VALUES ('${ids.platformTestForInsert}', '${ctx.regionId}', 'organization', NULL)`],
    ['recommendation_regions platform/non-null', `${fixtureSql(ctx)}
      INSERT INTO public.recommendation_regions
      (recommendation_id, body_region_id, owner_kind, organization_id)
      VALUES ('${ids.platformRecommendationForInsert}', '${ctx.regionId}',
              'platform', '${ctx.organizationId}')`],
    ['recommendation_regions organization/null', `${fixtureSql(ctx)}
      INSERT INTO public.recommendation_regions
      (recommendation_id, body_region_id, owner_kind, organization_id)
      VALUES ('${ids.platformRecommendationForInsert}', '${ctx.regionId}', 'organization', NULL)`],
  ];
  for (const [label, statement] of attempts) {
    const result = psql(`BEGIN;\n${statement};`, { expectFailure: true });
    assert.equal(sqlState(result), '23514', `${label} must fail with CHECK SQLSTATE 23514: ${result.stderr}`);
  }
});

test('staff reads own and platform rows but no foreign rows in all four relations',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
SELECT 'PROOF_ROLE|' || current_user || '@' || current_database();
SELECT 'PROOF_TESTS|' || count(*) FILTER (WHERE id = '${ids.ownTest}') || '|'
       || count(*) FILTER (WHERE id = '${ids.platformTest}') || '|'
       || count(*) FILTER (WHERE id = '${ids.foreignTest}') FROM public.tests;
SELECT 'PROOF_CLINICAL_REGIONS|' || count(*) FILTER (WHERE clinical_test_id = '${ids.ownTest}') || '|'
       || count(*) FILTER (WHERE clinical_test_id = '${ids.platformTest}') || '|'
       || count(*) FILTER (WHERE clinical_test_id = '${ids.foreignTest}')
  FROM public.clinical_test_regions;
SELECT 'PROOF_RECOMMENDATIONS|' || count(*) FILTER (WHERE id = '${ids.ownRecommendation}') || '|'
       || count(*) FILTER (WHERE id = '${ids.platformRecommendation}') || '|'
       || count(*) FILTER (WHERE id = '${ids.foreignRecommendation}') FROM public.recommendations;
SELECT 'PROOF_RECOMMENDATION_REGIONS|' || count(*) FILTER (WHERE recommendation_id = '${ids.ownRecommendation}') || '|'
       || count(*) FILTER (WHERE recommendation_id = '${ids.platformRecommendation}') || '|'
       || count(*) FILTER (WHERE recommendation_id = '${ids.foreignRecommendation}')
  FROM public.recommendation_regions;
ROLLBACK;`);
    const seen = markers(result.stdout);
    assert.equal(seen.get('PROOF_ROLE'), 'app_staff@bcb_webapp_dev');
    for (const label of [
      'PROOF_TESTS', 'PROOF_CLINICAL_REGIONS', 'PROOF_RECOMMENDATIONS',
      'PROOF_RECOMMENDATION_REGIONS',
    ]) assert.equal(seen.get(label), '1|1|0', `${label}: expected own|platform|foreign`);
  });

function assertNoPlatformWrite(label, statement) {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
${statement};
ROLLBACK;`, { expectFailure: null });
  if (result.failed) {
    assert.equal(sqlState(result), '42501', `${label} must fail closed with 42501: ${result.stderr}`);
  } else {
    assert.equal(markers(result.stdout).get('PROOF_WRITE'), '0', `${label} changed a platform row`);
  }
}

test('staff cannot create, update, or delete platform rows in any of the four relations',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const operations = [
      ['insert tests', `INSERT INTO public.tests(id, owner_kind, organization_id, title)
        VALUES ('${ids.invalidWrite}', 'platform', NULL, 'forbidden')`],
      ['update tests', `WITH changed AS (UPDATE public.tests SET title = 'forbidden'
        WHERE id = '${ids.platformTest}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete tests', `WITH changed AS (DELETE FROM public.tests
        WHERE id = '${ids.platformTest}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['insert clinical_test_regions', `INSERT INTO public.clinical_test_regions
        (clinical_test_id, body_region_id, owner_kind, organization_id)
        VALUES ('${ids.platformTestForInsert}', '${ctx.regionId}', 'platform', NULL)`],
      ['update clinical_test_regions', `WITH changed AS (UPDATE public.clinical_test_regions
        SET organization_id = organization_id WHERE clinical_test_id = '${ids.platformTest}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete clinical_test_regions', `WITH changed AS (DELETE FROM public.clinical_test_regions
        WHERE clinical_test_id = '${ids.platformTest}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['insert recommendations', `INSERT INTO public.recommendations
        (id, owner_kind, organization_id, title, body_md)
        VALUES ('${ids.invalidWrite}', 'platform', NULL, 'forbidden', 'proof')`],
      ['update recommendations', `WITH changed AS (UPDATE public.recommendations SET title = 'forbidden'
        WHERE id = '${ids.platformRecommendation}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete recommendations', `WITH changed AS (DELETE FROM public.recommendations
        WHERE id = '${ids.platformRecommendation}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['insert recommendation_regions', `INSERT INTO public.recommendation_regions
        (recommendation_id, body_region_id, owner_kind, organization_id)
        VALUES ('${ids.platformRecommendationForInsert}', '${ctx.regionId}', 'platform', NULL)`],
      ['update recommendation_regions', `WITH changed AS (UPDATE public.recommendation_regions
        SET organization_id = organization_id
        WHERE recommendation_id = '${ids.platformRecommendation}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete recommendation_regions', `WITH changed AS (DELETE FROM public.recommendation_regions
        WHERE recommendation_id = '${ids.platformRecommendation}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
    ];
    for (const [label, statement] of operations) assertNoPlatformWrite(label, statement);
  });

// Форма запроса здесь не выдумана: drizzle перечисляет в INSERT ВСЕ колонки таблицы и подставляет
// `default` тем, которых нет в `.values(...)`. `owner_kind` объявлен с `.default('organization')`, значит
// он попадает в список колонок КАЖДОЙ обычной записи врача, хотя порты владение не передают
// (`pgClinicalTests.ts:490`, `pgRecommendations.ts`). Поэтому `app_staff` обязан иметь `INSERT(owner_kind)`
// по всем четырём отношениям — без гранта создание теста и рекомендации падает с `42501`, и это уже
// ловилось живым HTTP 500 в приложении. Порядок значений владения при этом никуда не расширяется: что
// именно можно записать, решают CHECK и `WITH CHECK` действующей `FOR ALL`-политики — за этим следит
// соседний тест «staff cannot create, update, or delete platform rows».
test('обычная организационная запись врача проходит той же дверью, что и до S0б',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const attempts = [
      ['tests', `INSERT INTO public.tests(id, owner_kind, organization_id, title)
        VALUES ('${ids.invalidWrite}', DEFAULT, '${ctx.organizationId}', 'allowed own test')`],
      ['clinical_test_regions', `INSERT INTO public.clinical_test_regions
        (owner_kind, organization_id, clinical_test_id, body_region_id)
        VALUES (DEFAULT, '${ctx.organizationId}', '${ids.ownTest}', '${ctx.regionId}')`],
      ['recommendations', `INSERT INTO public.recommendations
        (id, owner_kind, organization_id, title, body_md)
        VALUES ('${ids.invalidWrite}', DEFAULT, '${ctx.organizationId}', 'allowed own rec', 'proof')`],
      ['recommendation_regions', `INSERT INTO public.recommendation_regions
        (owner_kind, organization_id, recommendation_id, body_region_id)
        VALUES (DEFAULT, '${ctx.organizationId}', '${ids.ownRecommendation}', '${ctx.regionId}')`],
    ];
    const failures = [];
    for (const [label, statement] of attempts) {
      const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
DELETE FROM public.clinical_test_regions
 WHERE clinical_test_id = '${ids.ownTest}' AND body_region_id = '${ctx.regionId}';
DELETE FROM public.recommendation_regions
 WHERE recommendation_id = '${ids.ownRecommendation}' AND body_region_id = '${ctx.regionId}';
${statement};
ROLLBACK;`, { expectFailure: null });
      if (result.failed) failures.push(`${label}:${sqlState(result) ?? 'unknown'}`);
    }
    assert.deepEqual(
      failures,
      [],
      `ordinary organization-owned writes were refused: ${failures.join(', ')}`,
    );
  });

test('organization_id IS NULL remains part of the platform read boundary', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
ALTER TABLE public.tests DROP CONSTRAINT tests_owner_check;
INSERT INTO public.be_organizations (id, title)
VALUES ('${ids.foreignOrganization}', 'S0б rollback-only corrupt-row clinic');
INSERT INTO public.tests(id, owner_kind, organization_id, title)
VALUES ('${ids.corruptPlatformTest}', 'platform', '${ids.foreignOrganization}', 'corrupt rollback row');
${installPoliciesSql()}
${installStaffContext(ctx)}
SELECT 'PROOF_CORRUPT_PLATFORM|' || count(*) FROM public.tests
 WHERE id = '${ids.corruptPlatformTest}';
ROLLBACK;`);
  assert.equal(markers(result.stdout).get('PROOF_CORRUPT_PLATFORM'), '0',
    'a corrupt non-null organization_id must not become platform-visible');
});

test('current_user narrows platform reads to the app_staff runtime role', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const temporaryRole = 'audit_s0b_current_user';
  const result = psql(`
BEGIN;
CREATE ROLE ${temporaryRole};
GRANT app_staff TO ${temporaryRole} WITH INHERIT TRUE;
GRANT SELECT ON public.tests TO ${temporaryRole};
GRANT EXECUTE ON FUNCTION app.begin_port_context(uuid, app.port_context_claims),
  app.clear_port_context(), app.install_port_context(uuid, app.port_context_claims),
  app.current_org_id() TO ${temporaryRole};
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES ('${ids.temporaryCapability}', '${ctx.port}'::app.port_name, '${temporaryRole}'::name,
        'app_staff'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure);
INSERT INTO public.tests(id, owner_kind, organization_id, title)
VALUES ('${ids.platformTest}', 'platform', NULL, 'S0б current-user rollback row');
${installPoliciesSql()}
DROP POLICY rev10_context_gate_205 ON public.tests;
SET LOCAL SESSION AUTHORIZATION ${temporaryRole};
SELECT app.begin_port_context(
  '${ids.temporaryCapability}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${ctx.argsHash}', 'hex'), '${ctx.actorRef}'::uuid,
      NULL::uuid, '${ctx.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);
RESET ROLE;
SELECT 'PROOF_MEMBER_ROLE|' || current_user || '|'
       || count(*) FROM public.tests WHERE id = '${ids.platformTest}';
RESET SESSION AUTHORIZATION;
ROLLBACK;`);
  assert.equal(markers(result.stdout).get('PROOF_MEMBER_ROLE'), `${temporaryRole}|0`,
    'an inherited app_staff member must not read platform rows outside SET ROLE app_staff');
});

after(() => {
  if (!ENABLED) return;
  const result = psql(`
SELECT 'PROOF_RESIDUE|' || (
  (SELECT count(*) FROM public.be_organizations WHERE id = '${ids.foreignOrganization}')
  + (SELECT count(*) FROM public.tests WHERE id IN (
      '${ids.platformTest}', '${ids.platformTestForInsert}', '${ids.ownTest}',
      '${ids.foreignTest}', '${ids.invalidWrite}', '${ids.corruptPlatformTest}'))
  + (SELECT count(*) FROM public.recommendations WHERE id IN (
      '${ids.platformRecommendation}', '${ids.platformRecommendationForInsert}',
      '${ids.ownRecommendation}', '${ids.foreignRecommendation}', '${ids.invalidWrite}'))
  + (SELECT count(*) FROM public.clinical_test_regions WHERE clinical_test_id IN (
      '${ids.platformTest}', '${ids.platformTestForInsert}', '${ids.ownTest}', '${ids.foreignTest}'))
  + (SELECT count(*) FROM public.recommendation_regions WHERE recommendation_id IN (
      '${ids.platformRecommendation}', '${ids.platformRecommendationForInsert}',
      '${ids.ownRecommendation}', '${ids.foreignRecommendation}'))
  + (SELECT count(*) FROM pg_roles WHERE rolname = 'audit_s0b_current_user')
);
SELECT 'PROOF_POLICY_RESTORE|' || count(*) FROM pg_policy
 WHERE polname IN ('rev10_platform_lfk_read_76', 'rev10_platform_lfk_read_163',
                   'rev10_platform_lfk_read_164', 'rev10_platform_lfk_read_205');
SELECT 'PROOF_CONSTRAINT_RESTORE|' || count(*) FROM pg_constraint
 WHERE conname IN ('tests_owner_check', 'recommendations_owner_check',
                   'clinical_test_regions_owner_check', 'recommendation_regions_owner_check');
SELECT 'PROOF_CONTEXT_POLICY_RESTORE|' || count(*) FROM pg_policy
 WHERE polname = 'rev10_context_gate_205' AND polrelid = 'public.tests'::regclass;`);
  const seen = markers(result.stdout);
  assert.equal(markers(result.stdout).get('PROOF_RESIDUE'), '0',
    'rollback-only S0б fixtures or role left residue');
  assert.equal(seen.get('PROOF_POLICY_RESTORE'), String(initialPolicyCount),
    'manual platform policies did not return to their initial state');
  assert.equal(seen.get('PROOF_CONSTRAINT_RESTORE'), '4', 'owner CHECK constraints were not restored');
  assert.equal(seen.get('PROOF_CONTEXT_POLICY_RESTORE'), '1', 'tests context policy was not restored');
});
