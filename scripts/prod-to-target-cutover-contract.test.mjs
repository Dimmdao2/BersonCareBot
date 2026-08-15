import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const manifestSql = read('deploy/postgres/prod-to-target-patient-membership-manifest.sql');
const preflightSql = read('deploy/postgres/pre-cutover-data-stage-assertions.sql');
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

function reconstructMembership({ users }) {
  const expected = new Set(
    users
      .filter((user) => user.role === 'client' && user.mergedIntoId === null && !user.archived)
      .map((user) => user.id),
  );
  return {
    enrollments: [...expected].map((platformUserId) => ({
      platformUserId,
      organizationId: 'canonical-org',
      status: 'active',
    })),
    specialistLinks: [...expected].map((patientUserId) => ({
      patientUserId,
      organizationId: 'canonical-org',
      specialistId: 'canonical-specialist',
      status: 'active',
    })),
  };
}

function findMembershipViolations({ expected, enrollments, specialistLinks }) {
  const violations = [];
  for (const platformUserId of expected) {
    const activeEnrollments = enrollments.filter(
      (enrollment) => enrollment.platformUserId === platformUserId && enrollment.status === 'active',
    );
    const activeLinks = specialistLinks.filter(
      (link) => link.patientUserId === platformUserId && link.status === 'active',
    );
    if (
      activeEnrollments.length !== 1
      || activeEnrollments[0]?.organizationId !== 'canonical-org'
    ) {
      violations.push(`enrollment:${platformUserId}`);
    }
    if (
      activeLinks.length !== 1
      || activeLinks[0]?.organizationId !== 'canonical-org'
      || activeLinks[0]?.specialistId !== 'canonical-specialist'
    ) {
      violations.push(`specialist-link:${platformUserId}`);
    }
  }
  for (const enrollment of enrollments) {
    if (
      enrollment.status === 'active'
      && (!expected.has(enrollment.platformUserId) || enrollment.organizationId !== 'canonical-org')
    ) {
      violations.push(`extra-enrollment:${enrollment.platformUserId}`);
    }
  }
  for (const link of specialistLinks) {
    if (
      link.status === 'active'
      && (
        !expected.has(link.patientUserId)
        || link.organizationId !== 'canonical-org'
        || link.specialistId !== 'canonical-specialist'
      )
    ) {
      violations.push(`extra-specialist-link:${link.patientUserId}`);
    }
  }
  return violations;
}

test('active canonical client without patient-domain facts receives canonical enrollment and specialist link', () => {
  assert.deepEqual(patientRelations, expectedPatientRelations);
  const membership = reconstructMembership({
    users: [{ id: 'client-without-facts', role: 'client', mergedIntoId: null, archived: false }],
  });
  assert.deepEqual(membership.enrollments, [{
    platformUserId: 'client-without-facts',
    organizationId: 'canonical-org',
    status: 'active',
  }]);
  assert.deepEqual(membership.specialistLinks, [{
    patientUserId: 'client-without-facts',
    organizationId: 'canonical-org',
    specialistId: 'canonical-specialist',
    status: 'active',
  }]);
});

test('merged and archived identities do not gain reconstructed membership', () => {
  const membership = reconstructMembership({
    users: [
      { id: 'merged', role: 'client', mergedIntoId: 'canonical', archived: false },
      { id: 'archived', role: 'client', mergedIntoId: null, archived: true },
    ],
  });
  assert.deepEqual(membership.enrollments, []);
  assert.deepEqual(membership.specialistLinks, []);
});

test('post-oracle rejects missing, duplicate, wrong, and extra active membership endpoints', () => {
  const expected = new Set(['client']);
  assert.deepEqual(findMembershipViolations({
    expected,
    enrollments: [{ platformUserId: 'client', organizationId: 'canonical-org', status: 'active' }],
    specialistLinks: [{
      patientUserId: 'client',
      organizationId: 'canonical-org',
      specialistId: 'canonical-specialist',
      status: 'active',
    }],
  }), []);

  assert.deepEqual(findMembershipViolations({
    expected,
    enrollments: [
      { platformUserId: 'client', organizationId: 'canonical-org', status: 'active' },
      { platformUserId: 'client', organizationId: 'other-org', status: 'active' },
    ],
    specialistLinks: [{
      patientUserId: 'client',
      organizationId: 'canonical-org',
      specialistId: 'other-specialist',
      status: 'active',
    }],
  }), [
    'enrollment:client',
    'specialist-link:client',
    'extra-enrollment:client',
    'extra-specialist-link:client',
  ]);
});

test('SQL transition and pre/post oracle consume the all-active-canonical manifest', () => {
  assert.match(dataSql, /\\ir prod-to-target-patient-membership-manifest\.sql/u);
  assert.match(manifestSql, /cutover_expected_active_canonical_client_membership/u);
  assert.match(manifestSql, /FROM %I\.platform_users patient/u);
  assert.match(manifestSql, /FROM %I\.be_appointments appointment/u);
  assert.match(preflightSql, /active canonical client manifest drift/u);
  assert.match(preflightSql, /cutover_expected_active_canonical_client_membership/u);
  assert.match(preflightSql, /patient-domain reference outside active canonical manifest/u);
  assert.match(dataSql, /INSERT INTO public\.org_enrollments[\s\S]+FROM cutover_expected_active_canonical_client_membership/u);
  assert.match(dataSql, /INSERT INTO public\.patient_specialist_links[\s\S]+FROM cutover_expected_active_canonical_client_membership/u);
  assert.doesNotMatch(dataSql, /INSERT INTO cutover_expected_active_canonical_client_membership[\s\S]+be_appointments/u);
  assert.match(finishSql, /active canonical clients without exactly one canonical enrollment/u);
  assert.match(finishSql, /active canonical clients without exactly one canonical specialist link/u);
  assert.match(finishSql, /extra or wrong-organization active enrollment/u);
  assert.match(finishSql, /extra or wrong-specialist active patient link/u);
  assert.match(finishSql, /patient-domain reference closure missing canonical membership/u);
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
