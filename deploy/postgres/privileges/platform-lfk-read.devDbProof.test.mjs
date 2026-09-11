/**
 * Live proof for EXERCISE_STORE_PLAN S0a / I1 / I2 on the named DEV database.
 *
 * Named silent failures:
 * - a staff catalog loses a platform parent or child, or exposes another clinic's family;
 * - a staff session mutates the referential platform layer;
 * - a context-free staff session or a patient gets ambient platform visibility;
 * - a child can disagree with its parent's ownership.
 *
 * The oracle is the owner plan, not declaration.ts. The proof never installs a policy: it must turn
 * red until the candidate declaration has actually been reconciled. Every fixture is non-empty and
 * transaction-local; PostgreSQL rolls it back before the assertion is evaluated.
 *
 * Run:
 *   RUN_PLATFORM_LFK_READ_DB=1 node --test \
 *     deploy/postgres/privileges/platform-lfk-read.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

const ENABLED = process.env.RUN_PLATFORM_LFK_READ_DB === '1';
const DATABASE = process.env.PLATFORM_LFK_READ_PROOF_DB ?? 'bcb_webapp_dev';
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

if (DATABASE !== 'bcb_webapp_dev') {
  throw new Error(`platform LFK live proof refuses non-DEV database '${DATABASE}'`);
}

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
  return new Map(rows(output).filter(([label]) => label.startsWith('PROOF_')));
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
       || patient.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') || '|'
       || region.id::text
  FROM public.be_organization_members m
  JOIN app_ext.variant_a_identity_refs refs
    ON refs.physical_user_id = m.platform_user_id AND refs.ref_kind = 'actor'
  CROSS JOIN LATERAL (
    SELECT capability_id, session_login
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'staff' AND target_role = 'app_staff'
       AND purpose = 'relation' AND function_identity IS NULL
     ORDER BY session_login LIMIT 1
  ) staff
  CROSS JOIN LATERAL (
    SELECT session_login
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'patient' AND target_role = 'app_patient'
     ORDER BY session_login LIMIT 1
  ) patient
  CROSS JOIN LATERAL (SELECT id FROM public.reference_items ORDER BY id LIMIT 1) region
 WHERE m.status = 'active'
 ORDER BY m.organization_id
 LIMIT 1;`).stdout;
  const [[organizationId, actorRef, capabilityId, staffLogin, patientLogin, argsHash, regionId] = []]
    = rows(output);
  assert.ok(regionId, `${DATABASE}: runtime context fixture is unavailable`);
  assert.match(argsHash, /^[0-9a-f]{64}$/u, 'typed args hash must be a SHA-256 hex value');
  return {
    organizationId: checkedUuid(organizationId, 'organization'),
    actorRef: checkedUuid(actorRef, 'actor ref'),
    capabilityId: checkedUuid(capabilityId, 'capability'),
    staffLogin: checkedIdentifier(staffLogin, 'staff login'),
    patientLogin: checkedIdentifier(patientLogin, 'patient login'),
    argsHash,
    regionId: checkedUuid(regionId, 'region'),
  };
}

const fixtureIds = {
  platformExercise: randomUUID(),
  platformMedia: randomUUID(),
  foreignOrganization: randomUUID(),
  foreignExercise: randomUUID(),
  foreignMedia: randomUUID(),
};

function fixtureSql(context) {
  return `
INSERT INTO public.be_organizations (id, title)
VALUES ('${fixtureIds.foreignOrganization}'::uuid, 'S0a rollback-only foreign clinic');
INSERT INTO public.lfk_exercises (id, owner_kind, organization_id, catalog_scope, title)
VALUES
  ('${fixtureIds.platformExercise}'::uuid, 'platform', NULL, 'catalog', 'S0a rollback platform exercise'),
  ('${fixtureIds.foreignExercise}'::uuid, 'organization', '${fixtureIds.foreignOrganization}'::uuid,
   'catalog', 'S0a rollback foreign exercise');
INSERT INTO public.lfk_exercise_media
  (id, exercise_id, media_url, media_type, sort_order, owner_kind, organization_id)
VALUES
  ('${fixtureIds.platformMedia}'::uuid, '${fixtureIds.platformExercise}'::uuid,
   'https://proof.invalid/platform', 'image', 0, 'platform', NULL),
  ('${fixtureIds.foreignMedia}'::uuid, '${fixtureIds.foreignExercise}'::uuid,
   'https://proof.invalid/foreign', 'image', 0, 'organization', '${fixtureIds.foreignOrganization}'::uuid);
INSERT INTO public.lfk_exercise_regions (exercise_id, region_ref_id, owner_kind, organization_id)
VALUES
  ('${fixtureIds.platformExercise}'::uuid, '${context.regionId}'::uuid, 'platform', NULL),
  ('${fixtureIds.foreignExercise}'::uuid, '${context.regionId}'::uuid,
   'organization', '${fixtureIds.foreignOrganization}'::uuid);
INSERT INTO public.lfk_exercise_load_types (exercise_id, load_type, owner_kind, organization_id)
VALUES
  ('${fixtureIds.platformExercise}'::uuid, 's0a-platform-proof', 'platform', NULL),
  ('${fixtureIds.foreignExercise}'::uuid, 's0a-foreign-proof',
   'organization', '${fixtureIds.foreignOrganization}'::uuid);`;
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
function preparedContext() {
  context ??= runtimeContext();
  return context;
}

test('staff with an organization context reads the complete platform family and no foreign family',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installStaffContext(ctx)}
SELECT 'PROOF_ROLE|' || current_user || '@' || current_database();
SELECT 'PROOF_PLATFORM_PARENT|' || count(*) FROM public.lfk_exercises
 WHERE id = '${fixtureIds.platformExercise}'::uuid;
SELECT 'PROOF_PLATFORM_MEDIA|' || count(*) FROM public.lfk_exercise_media
 WHERE exercise_id = '${fixtureIds.platformExercise}'::uuid;
SELECT 'PROOF_PLATFORM_REGIONS|' || count(*) FROM public.lfk_exercise_regions
 WHERE exercise_id = '${fixtureIds.platformExercise}'::uuid;
SELECT 'PROOF_PLATFORM_LOAD_TYPES|' || count(*) FROM public.lfk_exercise_load_types
 WHERE exercise_id = '${fixtureIds.platformExercise}'::uuid;
SELECT 'PROOF_FOREIGN_PARENT|' || count(*) FROM public.lfk_exercises
 WHERE id = '${fixtureIds.foreignExercise}'::uuid;
SELECT 'PROOF_FOREIGN_MEDIA|' || count(*) FROM public.lfk_exercise_media
 WHERE exercise_id = '${fixtureIds.foreignExercise}'::uuid;
SELECT 'PROOF_FOREIGN_REGIONS|' || count(*) FROM public.lfk_exercise_regions
 WHERE exercise_id = '${fixtureIds.foreignExercise}'::uuid;
SELECT 'PROOF_FOREIGN_LOAD_TYPES|' || count(*) FROM public.lfk_exercise_load_types
 WHERE exercise_id = '${fixtureIds.foreignExercise}'::uuid;
ROLLBACK;`);
    const seen = markers(result.stdout);
    assert.equal(seen.get('PROOF_ROLE'), 'app_staff@bcb_webapp_dev');
    for (const label of [
      'PROOF_PLATFORM_PARENT', 'PROOF_PLATFORM_MEDIA', 'PROOF_PLATFORM_REGIONS',
      'PROOF_PLATFORM_LOAD_TYPES',
    ]) assert.equal(seen.get(label), '1', `${label}: the non-empty platform row must be visible`);
    for (const label of [
      'PROOF_FOREIGN_PARENT', 'PROOF_FOREIGN_MEDIA', 'PROOF_FOREIGN_REGIONS',
      'PROOF_FOREIGN_LOAD_TYPES',
    ]) assert.equal(seen.get(label), '0', `${label}: the non-empty foreign row must stay hidden`);
  });

test('staff cannot insert, update, or delete the referential platform layer', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const insertedId = randomUUID();
  const insert = psql(`
BEGIN;
${fixtureSql(ctx)}
${installStaffContext(ctx)}
INSERT INTO public.lfk_exercises (id, owner_kind, organization_id, catalog_scope, title)
VALUES ('${insertedId}'::uuid, 'platform', NULL, 'catalog', 'forbidden');`, { expectFailure: true });
  assert.equal(sqlState(insert), '42501', `platform INSERT must fail with RLS 42501: ${insert.stderr}`);

  const update = psql(`
BEGIN;
${fixtureSql(ctx)}
${installStaffContext(ctx)}
WITH changed AS (
  UPDATE public.lfk_exercises SET title = 'forbidden'
   WHERE id = '${fixtureIds.platformExercise}'::uuid RETURNING 1
) SELECT 'PROOF_UPDATE_PLATFORM|' || count(*) FROM changed;
ROLLBACK;`, { expectFailure: null });
  if (update.failed) assert.equal(sqlState(update), '42501', update.stderr);
  else assert.equal(markers(update.stdout).get('PROOF_UPDATE_PLATFORM'), '0');

  const deletion = psql(`
BEGIN;
${fixtureSql(ctx)}
${installStaffContext(ctx)}
WITH removed AS (
  DELETE FROM public.lfk_exercises WHERE id = '${fixtureIds.platformExercise}'::uuid RETURNING 1
) SELECT 'PROOF_DELETE_PLATFORM|' || count(*) FROM removed;
ROLLBACK;`, { expectFailure: null });
  if (deletion.failed) assert.equal(sqlState(deletion), '42501', deletion.stderr);
  else assert.equal(markers(deletion.stdout).get('PROOF_DELETE_PLATFORM'), '0');
});

test('staff without an organization context cannot see platform rows', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
SET LOCAL SESSION AUTHORIZATION ${ctx.staffLogin};
SET LOCAL ROLE app_staff;
SELECT count(*) FROM public.lfk_exercises WHERE id = '${fixtureIds.platformExercise}'::uuid;`,
  { expectFailure: true });
  assert.equal(sqlState(result), '42501', `context-free read must fail closed: ${result.stderr}`);
});

test('the patient role has no ambient read of the platform LFK layer', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
SET LOCAL SESSION AUTHORIZATION ${ctx.patientLogin};
SET LOCAL ROLE app_patient;
SELECT count(*) FROM public.lfk_exercises WHERE id = '${fixtureIds.platformExercise}'::uuid;`,
  { expectFailure: true });
  assert.equal(sqlState(result), '42501', `patient ambient read must fail closed: ${result.stderr}`);
});

test('the child-owner trigger rejects a child that disagrees with its platform parent',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const result = psql(`
BEGIN;
${fixtureSql(ctx)}
INSERT INTO public.lfk_exercise_media
  (id, exercise_id, media_url, media_type, sort_order, owner_kind, organization_id)
VALUES (gen_random_uuid(), '${fixtureIds.platformExercise}'::uuid,
        'https://proof.invalid/mismatch', 'image', 1,
        'organization', '${fixtureIds.foreignOrganization}'::uuid);`, { expectFailure: true });
    assert.equal(sqlState(result), '23514', `mismatched child ownership must fail: ${result.stderr}`);
    assert.match(result.stderr, /lfk_child_owner_mismatch/u);
  });

after(() => {
  if (!ENABLED) return;
  const result = psql(`
SELECT 'PROOF_RESIDUE|' || (
  (SELECT count(*) FROM public.be_organizations WHERE id = '${fixtureIds.foreignOrganization}'::uuid)
  + (SELECT count(*) FROM public.lfk_exercises
      WHERE id IN ('${fixtureIds.platformExercise}'::uuid, '${fixtureIds.foreignExercise}'::uuid))
  + (SELECT count(*) FROM public.lfk_exercise_media
      WHERE id IN ('${fixtureIds.platformMedia}'::uuid, '${fixtureIds.foreignMedia}'::uuid))
  + (SELECT count(*) FROM public.lfk_exercise_regions
      WHERE exercise_id IN ('${fixtureIds.platformExercise}'::uuid, '${fixtureIds.foreignExercise}'::uuid))
  + (SELECT count(*) FROM public.lfk_exercise_load_types
      WHERE exercise_id IN ('${fixtureIds.platformExercise}'::uuid, '${fixtureIds.foreignExercise}'::uuid))
);`);
  assert.equal(markers(result.stdout).get('PROOF_RESIDUE'), '0', 'rollback-only fixtures left residue');
});
