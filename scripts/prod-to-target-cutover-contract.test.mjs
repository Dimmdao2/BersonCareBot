import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const manifestSql = read('deploy/postgres/prod-to-target-patient-membership-manifest.sql');
const dataSql = read('deploy/postgres/prod-to-target-cutover-data.sql');
const finishSql = read('deploy/postgres/prod-to-target-cutover-finish.sql');

const patientRelations = new Set(
  [...manifestSql.matchAll(/^ {2}\('([a-z0-9_]+)', 'patient_user_id'\)/gmu)].map((match) => match[1]),
);

const expectedPatientRelations = new Set([
  'clinical_anamnesis_illness',
  'clinical_anamnesis_lifestyle',
  'clinical_anamnesis_trauma',
  'clinical_complaint',
  'clinical_diagnosis',
  'clinical_visit',
  'doctor_patient_support',
  'media_folders',
  'patient_comorbidity',
  'patient_files',
  'patient_lfk_assignments',
  'patient_payment',
  'program_action_log',
  'program_item_discussion_messages',
  'program_item_discussion_reads',
  'specialist_tasks',
  'test_attempts',
  'treatment_program_instances',
]);

function reconstructVisibility({ users, facts, appointments }) {
  const eligible = new Set(
    users
      .filter((user) => user.role === 'client' && user.mergedIntoId === null && !user.archived)
      .map((user) => user.id),
  );
  const members = new Set();
  for (const fact of facts) {
    if (patientRelations.has(fact.relation) && eligible.has(fact.patientUserId)) {
      members.add(fact.patientUserId);
    }
  }
  for (const appointment of appointments) {
    if (!appointment.deleted && eligible.has(appointment.patientUserId)) {
      members.add(appointment.patientUserId);
    }
  }
  return {
    doctorCanSee: (patientUserId) => members.has(patientUserId),
    resolvePatientOrganization: (patientUserId) => (
      members.has(patientUserId) ? { organizationId: 'canonical-org' } : { error: 'no_active_enrollment' }
    ),
  };
}

test('program/clinical/task facts without appointments rebuild patient visibility', () => {
  assert.deepEqual(patientRelations, expectedPatientRelations);
  for (const relation of ['treatment_program_instances', 'clinical_visit', 'specialist_tasks']) {
    const visibility = reconstructVisibility({
      users: [{ id: 'patient', role: 'client', mergedIntoId: null, archived: false }],
      facts: [{ relation, patientUserId: 'patient' }],
      appointments: [],
    });
    assert.equal(visibility.doctorCanSee('patient'), true, relation);
    assert.deepEqual(visibility.resolvePatientOrganization('patient'), {
      organizationId: 'canonical-org',
    });
  }
});

test('merged and archived identities do not gain reconstructed membership', () => {
  const visibility = reconstructVisibility({
    users: [
      { id: 'merged', role: 'client', mergedIntoId: 'canonical', archived: false },
      { id: 'archived', role: 'client', mergedIntoId: null, archived: true },
    ],
    facts: [
      { relation: 'clinical_visit', patientUserId: 'merged' },
      { relation: 'clinical_visit', patientUserId: 'archived' },
    ],
    appointments: [],
  });
  assert.equal(visibility.doctorCanSee('merged'), false);
  assert.equal(visibility.doctorCanSee('archived'), false);
});

test('SQL transition and post-oracle consume the shared manifest', () => {
  assert.match(dataSql, /\\ir prod-to-target-patient-membership-manifest\.sql/u);
  assert.match(dataSql, /INSERT INTO public\.org_enrollments[\s\S]+FROM cutover_expected_patient_domain_membership/u);
  assert.match(dataSql, /INSERT INTO public\.patient_specialist_links[\s\S]+FROM cutover_expected_patient_domain_membership/u);
  assert.match(finishSql, /patient-domain clients without active enrollment/u);
  assert.match(finishSql, /patient-domain clients without canonical specialist link/u);
});

test('every source-only relation has one reviewed fail-closed disposition', () => {
  const registryBlock = dataSql.match(
    /INSERT INTO cutover_source_relation_disposition[\s\S]*?DO \$source_only_disposition_gate\$/u,
  )?.[0];
  assert.ok(registryBlock);
  const rows = [...registryBlock.matchAll(/\('(?:public|integrator|drizzle)\.[^']+', '(transform|intentionally_retire)', '[^']+'\)/gu)];
  assert.equal(rows.length, 45);
  assert.equal(new Set(rows.map((row) => row[0].match(/^\('([^']+)'/u)?.[1])).size, 45);
  assert.doesNotMatch(registryBlock, /CONTINUE/iu);
  assert.match(dataSql, /unexplained source-only relations/u);
  assert.match(dataSql, /stale source-only disposition entries/u);
});
