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
const ownerIdentitySql = read('apps/webapp/scripts/consolidate-owner-identity.sql');
const tenantShapesMigration = read(
  'apps/webapp/db/drizzle-migrations/0431_cutover_systemic_tenant_shapes_local.sql',
);
const deliveryTenantMigration = read(
  'apps/webapp/db/drizzle-migrations/0432_delivery_attempt_tenant_capability_local.sql',
);
const deliveryGlobalMigration = read(
  'apps/webapp/db/drizzle-migrations/0433_delivery_attempt_global_audit_compat_local.sql',
);

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

test('F1 specialist consolidation preserves every reference class before deleting the duplicate', () => {
  const source = {
    availability: Array.from({ length: 7 }, (_, index) => ({ id: `a${index}`, specialistId: 'duplicate' })),
    appointments: Array.from({ length: 133 }, (_, index) => ({
      id: `p${index}`,
      specialistId: 'duplicate',
      deleted: index >= 128,
    })),
  };
  const migrate = (rows) => rows.map((row) => ({
    ...row,
    specialistId: row.specialistId === 'duplicate' ? 'canonical' : row.specialistId,
  }));
  const migrated = {
    availability: migrate(source.availability),
    appointments: migrate(source.appointments),
  };
  assert.equal(migrated.availability.length, 7);
  assert.equal(migrated.appointments.filter((row) => row.specialistId === 'canonical').length, 133);
  assert.equal(migrated.appointments.filter((row) => row.deleted).length, 5);

  const deleteFirstMutant = { availability: [], appointments: source.appointments.map((row) => ({
    ...row,
    specialistId: null,
  })) };
  assert.throws(
    () => assert.deepEqual(deleteFirstMutant, migrated),
    /Expected values to be strictly deep-equal/u,
  );
  assert.match(ownerIdentitySql, /cutover_specialist_reference_baseline/u);
  assert.match(ownerIdentitySql, /cannot safely rewrite a composite FK/u);
  assert.match(ownerIdentitySql, /specialist_reference_post_gate/u);
  assert.match(dataSql, /cannot safely audit a composite FK/u);
  assert.ok(ownerIdentitySql.indexOf('specialist_reference_post_gate') < ownerIdentitySql.indexOf('DELETE FROM be_specialists'));
  assert.match(finishSql, /post-transition specialist reference drift/u);
});

test('F2 reminder history gate distinguishes attributable rows from honest nulls', () => {
  const canonicalByIntegrator = new Map([[10, 'patient-a'], [11, 'patient-b']]);
  const source = [{ id: 1, integratorUserId: 10 }, { id: 2, integratorUserId: 99 }];
  const target = source.map((row) => ({
    ...row,
    platformUserId: canonicalByIntegrator.get(row.integratorUserId) ?? null,
  }));
  assert.deepEqual(target.map((row) => row.platformUserId), ['patient-a', null]);
  const nullEverythingMutant = target.map((row) => ({ ...row, platformUserId: null }));
  assert.throws(
    () => assert.deepEqual(nullEverythingMutant, target),
    /Expected values to be strictly deep-equal/u,
  );
  assert.match(dataSql, /reminder history identity disposition drift/u);
  assert.match(finishSql, /post-transition reminder history identity drift/u);
});

test('F3 canonicalization keeps latest preference and earliest first-resolve semantics', () => {
  const canonical = new Map([['alias', 'patient'], ['patient', 'patient']]);
  const preferences = [
    { userId: 'alias', channel: 'telegram', enabled: true, updatedAt: 1 },
    { userId: 'patient', channel: 'telegram', enabled: false, updatedAt: 2 },
  ];
  const canonicalPreference = preferences
    .map((row) => ({ ...row, userId: canonical.get(row.userId) }))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  assert.deepEqual(canonicalPreference, {
    userId: 'patient', channel: 'telegram', enabled: false, updatedAt: 2,
  });
  assert.equal(Math.min(20, 10), 10);
  const verbatimCopyMutant = preferences[0];
  assert.throws(
    () => assert.equal(canonical.get(verbatimCopyMutant.userId), verbatimCopyMutant.userId),
    /Expected values to be strictly equal/u,
  );
  assert.match(dataSql, /channel preferences have no canonical identity mapping/u);
  assert.match(dataSql, /first-resolve rows have no canonical identity mapping/u);
  assert.match(dataSql, /cutover_reviewed_live_identity_references/u);
  assert.match(dataSql, /canonical channel preference disposition drift/u);
  assert.match(finishSql, /post-transition merged alias/u);
});

test('F4 draft gate preserves count and content in the canonical target shape', () => {
  const source = [{ id: 'draft-1', text: 'opaque', state: 'pending_confirmation' }];
  const target = source.map((row) => ({ ...row, organizationId: 'canonical', platformUserId: 'patient' }));
  assert.equal(target.length, source.length);
  assert.equal(target[0].text, source[0].text);
  const dropDraftMutant = [];
  assert.throws(
    () => assert.deepEqual(dropDraftMutant, source),
    /Expected values to be strictly deep-equal/u,
  );
  assert.match(dataSql, /'integrator\.message_drafts', 'transform', 'public\.support_conversations\.pending_message_drafts below'/u);
  assert.match(dataSql, /message draft preservation drift/u);
  assert.match(tenantShapesMigration, /ADD COLUMN IF NOT EXISTS pending_message_drafts jsonb/u);
  assert.match(dataSql, /cutover-pending-drafts:/u);
  assert.match(dataSql, /jsonb_array_elements\(conversation\.pending_message_drafts\)/u);
});

test('F5 tenant attribution gate rejects surviving operational rows without organization', () => {
  const source = [{ id: 1 }, { id: 2 }];
  const target = source.map((row) => ({ ...row, organizationId: 'canonical' }));
  assert.equal(target.filter((row) => row.organizationId === 'canonical').length, source.length);
  const missingAttributionMutant = target.map((row, index) => ({
    ...row,
    organizationId: index === 0 ? null : row.organizationId,
  }));
  assert.throws(
    () => assert.equal(
      missingAttributionMutant.filter((row) => row.organizationId === 'canonical').length,
      source.length,
    ),
    /Expected values to be strictly equal/u,
  );
  assert.match(dataSql, /delivery attempt logs missing canonical organization/u);
  assert.match(dataSql, /media playback hourly stats missing canonical organization/u);
  assert.match(finishSql, /post-transition delivery attempt organization drift/u);
  assert.match(finishSql, /post-transition playback hourly organization drift/u);
  assert.match(tenantShapesMigration, /organization_id, bucket_hour, delivery/u);
  assert.match(tenantShapesMigration, /v_organization_id uuid := app\.current_org_id\(\)/u);
  assert.match(deliveryTenantMigration, /OR p_organization_id IS NULL/u);
  assert.match(deliveryTenantMigration, /correlation_id, organization_id, channel/u);
  assert.doesNotMatch(deliveryGlobalMigration, /OR p_organization_id IS NULL/u);
  assert.match(deliveryGlobalMigration, /correlation_id, organization_id, channel/u);
});
