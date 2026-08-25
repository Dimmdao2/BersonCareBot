/**
 * Rollback-only named-DEV proof for the authenticated settings resolver.
 *
 * RUN_SETTINGS_SINGLE_ROOT_DB=1 node --test \
 *   deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs
 *
 * Fault injection:
 * RUN_SETTINGS_SINGLE_ROOT_DB=1 SETTINGS_SINGLE_ROOT_FAULT=org_guard node --test \
 *   deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_SETTINGS_SINGLE_ROOT_DB === '1';
const DATABASE = process.env.SETTINGS_SINGLE_ROOT_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.SETTINGS_SINGLE_ROOT_FAULT ?? '';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!['', 'org_guard'].includes(FAULT)) {
  throw new Error(`unknown SETTINGS_SINGLE_ROOT_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const migrationPath = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260824T120000_make_system_settings_single_root.sql',
);
function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    { input: `\\set VERBOSITY verbose\n${sql}`, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

function candidateFunctionBlock() {
  const source = fs.readFileSync(migrationPath, 'utf8');
  const block = source
    .split('--> statement-breakpoint')
    .find((candidate) => candidate.includes(
      'CREATE OR REPLACE FUNCTION app.read_authenticated_runtime_setting(',
    ));
  assert.ok(block, 'candidate authenticated resolver block is missing');
  if (FAULT !== 'org_guard') return block;

  const healthy = 'OR (p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM accepted_org)';
  assert.ok(block.includes(healthy), 'org-guard fault injection target is missing');
  return block.replace(healthy, 'OR false');
}

function fixture() {
  const row = psql(`
WITH candidate AS (
  SELECT patient.id AS patient_id,
         enrollment.organization_id,
         actor_ref.opaque_ref AS actor_ref,
         subject_ref.opaque_ref AS subject_ref
  FROM public.platform_users AS patient
  INNER JOIN public.org_enrollments AS enrollment
    ON enrollment.platform_user_id = patient.id
   AND enrollment.status = 'active'
  INNER JOIN app_ext.variant_a_identity_refs AS actor_ref
    ON actor_ref.physical_user_id = patient.id
   AND actor_ref.ref_kind = 'actor'
  INNER JOIN app_ext.variant_a_identity_refs AS subject_ref
    ON subject_ref.physical_user_id = patient.id
   AND subject_ref.ref_kind = 'subject'
  WHERE patient.role = 'client'
  ORDER BY patient.id
  LIMIT 1
), capability AS (
  SELECT capability_id, session_login
  FROM app_ext.port_context_capabilities
  WHERE context_class = 'patient'::app.port_context_class
    AND target_role = 'app_patient'::name
    AND purpose = 'relation'
    AND function_identity IS NULL
    AND active_until IS NULL
  ORDER BY session_login
  LIMIT 1
), other_org AS (
  SELECT enrollment.organization_id AS id
  FROM public.org_enrollments AS enrollment, candidate
  WHERE enrollment.organization_id IS DISTINCT FROM candidate.organization_id
  ORDER BY enrollment.organization_id
  LIMIT 1
)
SELECT candidate.patient_id::text || '|' || candidate.organization_id::text || '|'
       || candidate.actor_ref::text || '|' || candidate.subject_ref::text || '|'
       || capability.capability_id::text || '|' || capability.session_login::text || '|'
       || other_org.id::text
FROM candidate CROSS JOIN capability CROSS JOIN other_org;`);
  const parts = row.split('|');
  assert.equal(parts.length, 7, 'DEV needs an enrolled patient, relation capability, and second organization');
  return {
    patientId: parts[0],
    organizationId: parts[1],
    actorRef: parts[2],
    subjectRef: parts[3],
    capabilityId: parts[4],
    login: parts[5],
    otherOrganizationId: parts[6],
  };
}

function openPatientContext(f) {
  return `SET LOCAL SESSION AUTHORIZATION ${f.login};
SELECT app.begin_port_context(
  '${f.capabilityId}'::uuid,
  ROW(
    1::smallint,
    'patient'::app.port_context_class,
    'app_patient'::name,
    'relation',
    NULL::regprocedure,
    decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'),
    '${f.actorRef}'::uuid,
    '${f.subjectRef}'::uuid,
    '${f.organizationId}'::uuid,
    NULL::bigint,
    NULL::uuid
  )::app.port_context_claims
);`;
}

test('authenticated resolver returns own organization and rejects another organization',
  { skip: !ENABLED, concurrency: false }, () => {
    const f = fixture();
    const output = psql(`BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_settings_runtime_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_settings_runtime_owner;
SET LOCAL ROLE app_seam_settings_runtime_owner;
${candidateFunctionBlock()}
RESET ROLE;
REVOKE ALL ON FUNCTION app.read_authenticated_runtime_setting(text,text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_authenticated_runtime_setting(text,text,uuid,boolean) TO app_patient;
GRANT SELECT (key, scope, organization_id, value_json)
  ON public.system_settings TO app_seam_settings_runtime_owner;
INSERT INTO public.system_settings(key, scope, organization_id, value_json, updated_by)
VALUES
  ('patient_booking_url', 'admin', '${f.organizationId}'::uuid, '{"value":"own"}'::jsonb, NULL),
  ('patient_booking_url', 'admin', '${f.otherOrganizationId}'::uuid, '{"value":"other"}'::jsonb, NULL)
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
SET value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by;
${openPatientContext(f)}
SELECT json_build_object(
  'own_value', (
    SELECT value_json->>'value'
    FROM app.read_authenticated_runtime_setting(
      'patient_booking_url', 'admin', '${f.organizationId}'::uuid, true
    )
  ),
  'other_count', (
    SELECT count(*)
    FROM app.read_authenticated_runtime_setting(
      'patient_booking_url', 'admin', '${f.otherOrganizationId}'::uuid, true
    )
  )
)::text;
ROLLBACK;`);
    const resultLine = output.split('\n').filter(Boolean).at(-1);
    assert.ok(resultLine, 'resolver proof returned no result');
    assert.deepEqual(JSON.parse(resultLine), { own_value: 'own', other_count: 0 });
  });
