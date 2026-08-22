/**
 * D15b/7a Ш9 live DEV proof: patient demographics use the existing clinical-profile tenant wall.
 * The candidate columns and exact generated column grants are installed inside one transaction;
 * every fixture, policy injection and write is rolled back.
 *
 * Run:
 *   RUN_PATIENT_DEMOGRAPHICS_WALL_DB=1 node --test \
 *     deploy/postgres/privileges/patient-demographics-clinical-wall.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_PATIENT_DEMOGRAPHICS_WALL_DB === '1';
const DATABASE = process.env.PATIENT_DEMOGRAPHICS_WALL_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!/_dev$|_test$/u.test(DATABASE)) {
  throw new Error(`refusing to probe non dev/test database '${DATABASE}'`);
}

const ARTIFACT = readFileSync(
  fileURLToPath(new URL(`../generated/privileges.${DATABASE}.sql`, import.meta.url)),
  'utf8',
);
const STAFF_COLUMN_GRANTS = ARTIFACT.split('\n')
  .filter(
    (line) =>
      line.startsWith('GRANT ') &&
      line.includes(' ON TABLE "public"."doctor_patient_support" TO "app_staff";') &&
      (line.startsWith('GRANT INSERT ') || line.startsWith('GRANT UPDATE ')),
  )
  .join('\n');

assert.equal(
  STAFF_COLUMN_GRANTS.split('\n').filter(Boolean).length,
  2,
  'generated artifact must contain the exact staff INSERT and UPDATE column grants',
);
for (const column of ['birth_date', 'gender', 'height_cm', 'weight_kg']) {
  assert.ok(
    STAFF_COLUMN_GRANTS.includes(`"${column}"`),
    `generated staff grants do not carry ${column}`,
  );
}

function psql(sql) {
  try {
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
      {
        input: sql,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  } catch (failure) {
    throw new Error(`psql refused the demographics proof: ${failure.stderr ?? failure.message}`);
  }
}

function answers(stdout) {
  return new Map(
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[a-z_]+=/u.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

function uuid(value, what) {
  assert.match(
    value ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    `${what}: '${value}'`,
  );
  return value;
}

function login(value, what) {
  assert.match(value ?? '', /^[a-z_][a-z0-9_]*$/u, `${what}: unsafe login '${value}'`);
  return value;
}

function fixture() {
  const found = answers(
    psql(`
WITH patient_candidate AS (
  SELECT patient.id AS patient_id, enrollment.organization_id,
         patient_actor.opaque_ref AS patient_actor_ref,
         patient_subject.opaque_ref AS patient_subject_ref
    FROM public.platform_users patient
    JOIN public.org_enrollments enrollment
      ON enrollment.platform_user_id = patient.id AND enrollment.status = 'active'
    JOIN app_ext.variant_a_identity_refs patient_actor
      ON patient_actor.physical_user_id = patient.id AND patient_actor.ref_kind = 'actor'
    JOIN app_ext.variant_a_identity_refs patient_subject
      ON patient_subject.physical_user_id = patient.id AND patient_subject.ref_kind = 'subject'
   WHERE patient.role = 'client'
), staff_a AS (
  SELECT member.organization_id, ref.opaque_ref AS actor_ref
    FROM public.be_organization_members member
    JOIN app_ext.variant_a_identity_refs ref
      ON ref.physical_user_id = member.platform_user_id AND ref.ref_kind = 'actor'
   WHERE member.status = 'active'
), candidate AS (
  SELECT patient.*, own_staff.actor_ref AS staff_a_ref,
         foreign_staff.organization_id AS organization_b,
         foreign_staff.actor_ref AS staff_b_ref
    FROM patient_candidate patient
    JOIN staff_a own_staff ON own_staff.organization_id = patient.organization_id
    JOIN LATERAL (
      SELECT organization_id, actor_ref FROM staff_a
       WHERE organization_id <> patient.organization_id
       ORDER BY organization_id LIMIT 1
    ) foreign_staff ON true
   ORDER BY patient.patient_id LIMIT 1
)
SELECT 'fixture=' || patient_id::text || '|' || organization_id::text || '|'
       || patient_actor_ref::text || '|' || patient_subject_ref::text || '|'
       || staff_a_ref::text || '|' || organization_b::text || '|' || staff_b_ref::text
  FROM candidate;
SELECT 'staff_seam=' || capability_id::text || '|' || session_login
  FROM app_ext.port_context_capabilities
 WHERE context_class = 'staff' AND target_role = 'app_staff'
   AND purpose = 'relation' AND function_identity IS NULL
 ORDER BY session_login LIMIT 1;
SELECT 'patient_seam=' || capability_id::text || '|' || session_login
  FROM app_ext.port_context_capabilities
 WHERE context_class = 'patient' AND target_role = 'app_patient'
   AND purpose = 'relation' AND function_identity IS NULL
 ORDER BY session_login LIMIT 1;
SELECT 'args_hash=' || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex');
`),
  );
  const parts = (found.get('fixture') ?? '').split('|');
  assert.equal(
    parts.length,
    7,
    `${DATABASE}: need an enrolled patient plus active staff in two different clinics`,
  );
  const staffSeam = (found.get('staff_seam') ?? '').split('|');
  const patientSeam = (found.get('patient_seam') ?? '').split('|');
  assert.match(found.get('args_hash') ?? '', /^[0-9a-f]{64}$/u, 'typed-args hash');
  return {
    patient: uuid(parts[0], 'patient'),
    organizationA: uuid(parts[1], 'organization A'),
    patientActorRef: uuid(parts[2], 'patient actor ref'),
    patientSubjectRef: uuid(parts[3], 'patient subject ref'),
    staffARef: uuid(parts[4], 'staff A actor ref'),
    organizationB: uuid(parts[5], 'organization B'),
    staffBRef: uuid(parts[6], 'staff B actor ref'),
    staffCapability: uuid(staffSeam[0], 'staff capability'),
    staffLogin: login(staffSeam[1], 'staff login'),
    patientCapability: uuid(patientSeam[0], 'patient capability'),
    patientLogin: login(patientSeam[1], 'patient login'),
    argsHash: found.get('args_hash'),
  };
}

function clearContext() {
  return `RESET SESSION AUTHORIZATION;
DELETE FROM app_ext.accepted_port_contexts
 WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()
   AND cleared_at IS NULL;`;
}

function installStaffContext(state, actorRef, organizationId) {
  return `SET LOCAL SESSION AUTHORIZATION ${state.staffLogin};
SELECT app.begin_port_context('${state.staffCapability}'::uuid, ROW(1::smallint,
  'staff'::app.port_context_class, 'app_staff'::name, 'relation', NULL::regprocedure,
  decode('${state.argsHash}', 'hex'), '${actorRef}'::uuid, NULL::uuid,
  '${organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims);`;
}

function installPatientContext(state) {
  return `SET LOCAL SESSION AUTHORIZATION ${state.patientLogin};
SELECT app.begin_port_context('${state.patientCapability}'::uuid, ROW(1::smallint,
  'patient'::app.port_context_class, 'app_patient'::name, 'relation', NULL::regprocedure,
  decode('${state.argsHash}', 'hex'), '${state.patientActorRef}'::uuid,
  '${state.patientSubjectRef}'::uuid, '${state.organizationA}'::uuid,
  NULL::bigint, NULL::uuid)::app.port_context_claims);`;
}

test(
  'patient demographics keep the clinical tenant wall, including predicate injection',
  { skip: !ENABLED },
  () => {
    const state = fixture();
    const seen = answers(
      psql(`
BEGIN;
ALTER TABLE public.doctor_patient_support
  ADD COLUMN height_cm integer,
  ADD COLUMN weight_kg integer,
  ADD COLUMN gender text,
  ADD COLUMN birth_date date,
  ADD CONSTRAINT doctor_patient_support_gender_check
    CHECK (gender IS NULL OR gender IN ('male', 'female'));
${STAFF_COLUMN_GRANTS}
DELETE FROM public.doctor_patient_support WHERE patient_user_id = '${state.patient}'::uuid;
${installStaffContext(state, state.staffARef, state.organizationA)}
INSERT INTO public.doctor_patient_support (
  organization_id, patient_user_id, height_cm, weight_kg, gender, birth_date, updated_at
) VALUES (
  '${state.organizationA}'::uuid, '${state.patient}'::uuid, 180, 79, 'male', DATE '1991-02-03', now()
);
UPDATE public.doctor_patient_support
   SET height_cm = 181,
       updated_at = now()
 WHERE patient_user_id = '${state.patient}'::uuid;
SELECT 'own_staff_write=' || count(*) FROM public.doctor_patient_support
 WHERE patient_user_id = '${state.patient}'::uuid AND height_cm = 181 AND weight_kg = 79
   AND gender = 'male' AND birth_date = DATE '1991-02-03';

${clearContext()}
${installStaffContext(state, state.staffBRef, state.organizationB)}
SELECT 'foreign_before=' || count(*) FROM public.doctor_patient_support
 WHERE patient_user_id = '${state.patient}'::uuid;

${clearContext()}
CREATE TEMP TABLE d15b7a_policy_snapshot AS
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy
 WHERE polrelid = 'public.doctor_patient_support'::regclass
   AND polpermissive
   AND polroles @> ARRAY['app_staff'::regrole::oid]
   AND pg_get_expr(polqual, polrelid) LIKE '%current_org_id%';
DO $inject$
DECLARE p record;
BEGIN
  SELECT * INTO STRICT p FROM d15b7a_policy_snapshot;
  EXECUTE format('ALTER POLICY %I ON public.doctor_patient_support USING (true) WITH CHECK (true)', p.polname);
END
$inject$;
${installStaffContext(state, state.staffBRef, state.organizationB)}
SELECT 'foreign_injected=' || count(*) FROM public.doctor_patient_support
 WHERE patient_user_id = '${state.patient}'::uuid;

${clearContext()}
DO $restore$
DECLARE p record;
BEGIN
  SELECT * INTO STRICT p FROM d15b7a_policy_snapshot;
  EXECUTE format('ALTER POLICY %I ON public.doctor_patient_support USING (%s) WITH CHECK (%s)',
    p.polname, p.using_expr, p.check_expr);
END
$restore$;
${installStaffContext(state, state.staffBRef, state.organizationB)}
SELECT 'foreign_restored=' || count(*) FROM public.doctor_patient_support
 WHERE patient_user_id = '${state.patient}'::uuid;

${clearContext()}
${installPatientContext(state)}
SELECT 'patient_self=' || count(*) FROM public.doctor_patient_support
 WHERE patient_user_id = '${state.patient}'::uuid AND height_cm = 181 AND weight_kg = 79
   AND gender = 'male' AND birth_date = DATE '1991-02-03';
ROLLBACK;
`),
    );

    assert.equal(
      seen.get('own_staff_write'),
      '1',
      'own-clinic staff could not read back all four writes',
    );
    assert.equal(
      seen.get('foreign_before'),
      '0',
      'foreign clinic read the patient before injection',
    );
    assert.equal(
      seen.get('foreign_injected'),
      '1',
      'removing the clinical tenant predicate did not expose the foreign row; proof is vacuous',
    );
    assert.equal(
      seen.get('foreign_restored'),
      '0',
      'restoring the exact clinical tenant predicate did not close the foreign row',
    );
    assert.equal(seen.get('patient_self'), '1', 'patient could not read their own demographics');
  },
);
