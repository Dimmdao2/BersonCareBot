import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseSaasTestFixturePacket,
  validateSaasTestFixturePacketMetadata,
} from '../../../../../deploy/host/saas-test-fixture-packet.mjs';
import {
  assertAllowedFixtureDatabaseTarget,
  buildSaasTestFixturePlan,
  assertRequiredDatabaseName,
  isFixtureOwnedDiarySnapshot,
  isReservedDiarySnapshotKey,
  readSaasTestFixtureConfig,
  resolveFixtureAppointmentTimes,
  runSaasTestFixtureCli,
  SAAS_TEST_FIXTURE_IDS,
  SAAS_TEST_FIXTURE_MANIFEST,
  SAAS_TEST_FIXTURE_OPERATOR_REFS,
  SAAS_TEST_FIXTURE_PATIENT_PHONES,
} from '../../../scripts/seed-saas-test-walkthrough-fixtures';

const packetValues = {
  SAAS_TEST_FIXTURE_ENABLED: '1',
  SAAS_TEST_FIXTURE_CLINIC_A_EMAIL: 'clinic-a@example.test',
  SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: 'fixture-pass-a',
  SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: 'clinic-b@example.test',
  SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD: 'fixture-pass-b',
} as const;

function packetText(overrides: Partial<Record<keyof typeof packetValues, string>> = {}): string {
  const values = { ...packetValues, ...overrides };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n');
}

function metadata(
  overrides: Partial<{
    uid: number;
    gid: number;
    mode: number;
    symlink: boolean;
    file: boolean;
  }> = {},
) {
  const values = { uid: 0, gid: 42, mode: 0o100640, symlink: false, file: true, ...overrides };
  return {
    uid: values.uid,
    gid: values.gid,
    mode: values.mode,
    isSymbolicLink: () => values.symlink,
    isFile: () => values.file,
  };
}

describe('SaaS TEST fixture packet', () => {
  it('accepts exactly the five data-only JSON-quoted keys', () => {
    expect(parseSaasTestFixturePacket(packetText())).toEqual(packetValues);
  });

  it.each([
    ['disabled', packetText({ SAAS_TEST_FIXTURE_ENABLED: '0' }), 'explicit_enable_required'],
    ['duplicate', `${packetText()}\nSAAS_TEST_FIXTURE_ENABLED="1"`, 'duplicate_key'],
    ['unknown DATABASE_URL', `${packetText()}\nDATABASE_URL="postgres://prod"`, 'unknown_key'],
    ['unknown PGOPTIONS', `${packetText()}\nPGOPTIONS="-c role=postgres"`, 'unknown_key'],
    ['malformed export', `export ${packetText()}`, 'malformed_line'],
    ['unquoted', packetText().replace('="1"', '=1'), 'malformed_line'],
    [
      'command substitution',
      packetText({ SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: '$(touch /tmp/forbidden)' }),
      'unsafe_value',
    ],
    ['backticks', packetText({ SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: '`id`' }), 'unsafe_value'],
    [
      'escaped command substitution',
      packetText().replace('"fixture-pass-a"', '"\\u0024(touch /tmp/forbidden)"'),
      'unsafe_value',
    ],
  ])('rejects %s', (_label, text, code) => {
    expect(() => parseSaasTestFixturePacket(text)).toThrow(code);
  });

  it('requires a non-symlink root:deploy 0640 regular file', () => {
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata(), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).not.toThrow();
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ symlink: true }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow('symlink_forbidden');
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ uid: 1000 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow('owner_must_be_root');
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ gid: 1000 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow('group_must_be_deploy');
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ mode: 0o100600 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow('mode_must_be_0640');
  });
});

describe('SaaS TEST walkthrough reconciliation', () => {
  it('enables and locks the mirrored TEST-only walkthrough flags', () => {
    const source = readFileSync(
      new URL('../../../../../deploy/postgres/test-settings-override.sql', import.meta.url),
      'utf8',
    );
    expect(
      source.match(/VALUES \('specialist_signup_enabled', 'admin', '\{"value":true\}'::jsonb/g),
    ).toHaveLength(2);
    expect(
      source.match(
        /VALUES \('patient_program_discussion_ui_enabled', 'admin', '\{"value":true\}'::jsonb/g,
      ),
    ).toHaveLength(2);
    expect(source.match(/VALUES \('test_account_identifiers', 'admin'/g)).toHaveLength(2);
    expect(source.match(/"\+12025550101","\+12025550102"/g)).toHaveLength(2);
    expect(source).not.toContain('+12025550103');
    expect(source).toContain(
      "ARRAY['patient_app_maintenance_enabled','dev_mode','test_account_identifiers','smtp_outbound','specialist_signup_enabled','patient_program_discussion_ui_enabled']",
    );
    expect(source).toContain(
      "ARRAY['smtp_outbound','app_base_url','test_account_identifiers','specialist_signup_enabled','patient_program_discussion_ui_enabled']",
    );
  });

  it('uses an explicit schema for the integrator outbox send-safety proof', () => {
    const source = readFileSync(
      new URL('../../../scripts/seed-saas-test-walkthrough-fixtures.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('FROM integrator.projection_outbox');
    expect(source).not.toMatch(/FROM projection_outbox\b/);
  });

  it('seeds coherent historical clinical programs and verifies their runtime shape', () => {
    const source = readFileSync(
      new URL('../../../scripts/seed-saas-test-walkthrough-fixtures.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('assignedDayOffset: -30');
    expect(source).toContain('assignedDayOffset: -20');
    expect(source).toContain('createdAt: relativeIso(now, program.assignedDayOffset)');
    expect(source).toContain('startedAt: relativeIso(now, program.assignedDayOffset)');
    expect(source).toContain('sortOrder: 1');
    expect(source).toContain("assertCount('program_pipeline_stages'");
    expect(source).toContain("'program_created_before_first_action'");
    expect(source).toContain("'program_created_before_first_snapshot'");
  });

  it('validates two distinct reserved-domain owner credentials', () => {
    const config = readSaasTestFixtureConfig(packetValues);
    expect(config.ownerA.emailNormalized).toBe('clinic-a@example.test');
    expect(config.ownerB.emailNormalized).toBe('clinic-b@example.test');
    expect(() =>
      readSaasTestFixtureConfig({
        ...packetValues,
        SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: packetValues.SAAS_TEST_FIXTURE_CLINIC_A_EMAIL,
      }),
    ).toThrow('fixture_owner_emails_must_differ');
    expect(() =>
      readSaasTestFixtureConfig({
        ...packetValues,
        SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: 'real-address@example.com',
      }),
    ).toThrow('fixture_email_must_use_reserved_test_domain');
  });

  it('builds the manifest-v2 multi-staff and solo-clinic product fixture', () => {
    const plan = buildSaasTestFixturePlan(new Date('2026-07-15T22:30:00.000Z'));
    expect(SAAS_TEST_FIXTURE_MANIFEST).toMatchObject({
      namespace: 'saas_test_walkthrough',
      version: 2,
      expected: {
        clinicAStaff: 3,
        clinicBStaff: 1,
        clinicAPatients: 5,
        clinicBPatients: 3,
        appointments: 16,
        patientPackages: 2,
        programInstances: 2,
        programActions: 18,
        programEvents: 4,
        diarySnapshots: 21,
        supportProfiles: 1,
      },
      surfaces: {
        sharedPatient: true,
        globalAdmin: true,
        publicBooking: true,
        localMedia: true,
        tariffStorePaymentSafe: true,
        notificationsSendDisabled: true,
        doubleSeedSentinel: true,
      },
      lockedMatrix: {
        clinicAStaff: { readA: true, writeA: true, readB: false, writeB: false },
        clinicBStaff: { readA: false, writeA: false, readB: true, writeB: true },
        sharedPatient: { readA: true, readB: true, programWriteA: false, programWriteB: false },
        globalAdmin: { systemHealth: true, tenantClinicalWrite: false },
      },
      reservedPackageDisplayNumbers: [2_053_000_001, 2_053_000_002],
    });
    expect(plan.clinics).toEqual([
      {
        key: 'A',
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        patientCount: 5,
        staffCount: 3,
      },
      {
        key: 'B',
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationB,
        patientCount: 3,
        staffCount: 1,
      },
    ]);
    expect(plan.patients).toHaveLength(7);
    expect(plan.enrollments).toHaveLength(8);
    expect(plan.appointments).toHaveLength(16);
    expect(plan.patients.filter((row) => row.emailNormalized !== null)).toHaveLength(3);
    expect(plan.patients.find((row) => row.id === SAAS_TEST_FIXTURE_IDS.patientsA[0]))
      .toMatchObject({ phoneNormalized: SAAS_TEST_FIXTURE_PATIENT_PHONES.patientA });
    expect(plan.patients.find((row) => row.id === SAAS_TEST_FIXTURE_IDS.patientsB[0]))
      .toMatchObject({ phoneNormalized: SAAS_TEST_FIXTURE_PATIENT_PHONES.patientB });
    expect(plan.patients.filter((row) => row.phoneNormalized !== null).map((row) => row.phoneNormalized))
      .toEqual([
        SAAS_TEST_FIXTURE_PATIENT_PHONES.patientA,
        SAAS_TEST_FIXTURE_PATIENT_PHONES.patientB,
      ]);
    const sharedPatientId = SAAS_TEST_FIXTURE_IDS.sharedPatient;
    expect(plan.patients.find((row) => row.id === sharedPatientId)?.emailNormalized).toBe(
      'patient-shared@saas-fixture.test',
    );
    expect(plan.enrollments.filter((row) => row.platformUserId === sharedPatientId)).toHaveLength(
      2,
    );
    expect(plan.appointments.filter((row) => row.platformUserId === sharedPatientId)).toHaveLength(
      4,
    );
    for (const patient of plan.patients.filter((row) => row.id !== sharedPatientId)) {
      expect(plan.enrollments.filter((row) => row.platformUserId === patient.id)).toHaveLength(1);
      expect(plan.appointments.filter((row) => row.platformUserId === patient.id)).toHaveLength(2);
    }
    expect(plan.appointments.filter((row) => row.status === 'completed')).toHaveLength(8);
    expect(plan.appointments.filter((row) => row.status === 'confirmed')).toHaveLength(8);
    expect(plan.appointments.every((row) => row.serviceId != null)).toBe(true);
    expect(plan.actionLogs).toHaveLength(18);
    expect(plan.actionLogs.some((row) => String(row.patientUserId) === sharedPatientId)).toBe(
      false,
    );
    expect(plan.diarySnapshots).toHaveLength(21);
    expect(plan.actionLogs.some((row) => 'weightKg' in row.payload && 'reps' in row.payload)).toBe(
      true,
    );
    expect(
      plan.actionLogs.some((row) => 'reps' in row.payload && !('weightKg' in row.payload)),
    ).toBe(true);
    expect(
      plan.actionLogs.some((row) => !('reps' in row.payload) && 'weightKg' in row.payload),
    ).toBe(true);
    expect(
      plan.actionLogs.some((row) => !('reps' in row.payload) && !('weightKg' in row.payload)),
    ).toBe(true);
  });

  it('reserves only exact diary organization, patient and date keys', () => {
    const now = new Date('2026-07-15T22:30:00.000Z');
    const reserved = {
      organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
      platformUserId: SAAS_TEST_FIXTURE_IDS.patientsA[0],
      localDate: '2026-07-15',
    };
    expect(isReservedDiarySnapshotKey(reserved, now)).toBe(true);
    expect(isReservedDiarySnapshotKey({ ...reserved, localDate: '2026-06-01' }, now)).toBe(false);
    expect(
      isReservedDiarySnapshotKey(
        { ...reserved, organizationId: SAAS_TEST_FIXTURE_IDS.organizationB },
        now,
      ),
    ).toBe(false);
    expect(
      isReservedDiarySnapshotKey(
        { ...reserved, platformUserId: SAAS_TEST_FIXTURE_IDS.sharedPatient },
        now,
      ),
    ).toBe(false);
  });

  it('attributes rolling diary cleanup only to reserved program roots', () => {
    expect(
      isFixtureOwnedDiarySnapshot({
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        platformUserId: SAAS_TEST_FIXTURE_IDS.patientsA[0],
        planInstanceId: SAAS_TEST_FIXTURE_IDS.programInstances[0],
      }),
    ).toBe(true);
    expect(
      isFixtureOwnedDiarySnapshot({
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        platformUserId: SAAS_TEST_FIXTURE_IDS.patientsA[0],
        planInstanceId: null,
      }),
    ).toBe(false);
    expect(
      isFixtureOwnedDiarySnapshot({
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        platformUserId: SAAS_TEST_FIXTURE_IDS.patientsA[0],
        planInstanceId: SAAS_TEST_FIXTURE_IDS.programInstances[1],
      }),
    ).toBe(false);
  });

  it('publishes deterministic legacy booking mappings and the committed local media contract', () => {
    expect(SAAS_TEST_FIXTURE_IDS.externalMappings).toHaveLength(2);
    expect(SAAS_TEST_FIXTURE_IDS.legacyBranchServices).toHaveLength(2);
    expect(SAAS_TEST_FIXTURE_MANIFEST.localMediaPath).toBe('/test-fixtures/saas-exercise.svg');
  });

  it('publishes non-secret login, A/B context, route and viewport refs for the operator', () => {
    expect(SAAS_TEST_FIXTURE_MANIFEST.operatorRefs).toBe(SAAS_TEST_FIXTURE_OPERATOR_REFS);
    expect(SAAS_TEST_FIXTURE_OPERATOR_REFS.credentials.sharedPatient).toEqual({
      loginRef: 'patient_shared_a_b',
      email: 'patient-shared@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    });
    expect(SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts).toMatchObject({
      clinicA: {
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        sharedPatientEnrollmentId: SAAS_TEST_FIXTURE_IDS.enrollmentsA[4],
      },
      clinicB: {
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationB,
        sharedPatientEnrollmentId: SAAS_TEST_FIXTURE_IDS.enrollmentsB[2],
      },
      sharedPatient: { platformUserId: SAAS_TEST_FIXTURE_IDS.sharedPatient },
    });
    expect(SAAS_TEST_FIXTURE_OPERATOR_REFS.publicSurfaces).toEqual({
      app: '/app',
      cleanLogin: '/app',
      combinedSpecialistClinicRegistration: '/app',
      publicBooking: '/book',
      devCleanLoginHelper: '/api/auth/dev-public?view=login',
      devSpecialistRegistrationHelper: '/api/auth/dev-public?view=specialist-registration',
      devClinicRegistrationHelper: '/api/auth/dev-public?view=clinic-registration',
    });
    expect(SAAS_TEST_FIXTURE_OPERATOR_REFS.viewports).toEqual({
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    });
  });

  it('refuses every database name except the exact TEST database', () => {
    expect(() => assertRequiredDatabaseName('bersoncarebot_test')).not.toThrow();
    expect(() => assertRequiredDatabaseName('bcb_webapp_dev')).toThrow(
      'refusing_database_target:expected_bersoncarebot_test',
    );
    expect(() => assertRequiredDatabaseName('bcb_webapp_prod')).toThrow(
      'refusing_database_target:expected_bersoncarebot_test',
    );
    expect(() => assertRequiredDatabaseName('')).toThrow(
      'refusing_database_target:expected_bersoncarebot_test',
    );
  });

  it('allows rehearsal targets only with the explicit mode, guarded name and loopback URL', () => {
    const safeInput = {
      databaseName: 'bcb_saas_fixture_rehearsal_20260716',
      databaseUrl: 'postgres://owner@127.0.0.1/bcb_saas_fixture_rehearsal_20260716',
      attestedRehearsalDatabaseName: 'bcb_saas_fixture_rehearsal_20260716',
      rehearsalMode: true,
    };
    expect(() => assertAllowedFixtureDatabaseTarget(safeInput)).not.toThrow();
    for (const databaseName of [
      'bcb_webapp_prod',
      'bcb_webapp_dev',
      'arbitrary_rehearsal',
      'bcb_saas_prod_rehearsal_20260716',
    ]) {
      expect(() =>
        assertAllowedFixtureDatabaseTarget({ ...safeInput, databaseName }),
      ).toThrow('refusing_fixture_rehearsal_target');
    }
    expect(() =>
      assertAllowedFixtureDatabaseTarget({
        ...safeInput,
        databaseUrl: 'postgres://owner@db.example.test/bcb_saas_fixture_rehearsal_20260716',
      }),
    ).toThrow('refusing_fixture_rehearsal_target');
    expect(() =>
      assertAllowedFixtureDatabaseTarget({
        ...safeInput,
        attestedRehearsalDatabaseName: 'bcb_saas_fixture_rehearsal_reused',
      }),
    ).toThrow('refusing_fixture_rehearsal_target');
    expect(() =>
      assertAllowedFixtureDatabaseTarget({ ...safeInput, rehearsalMode: false }),
    ).toThrow('refusing_database_target:expected_bersoncarebot_test');
  });

  it('keeps all repo-reserved fixture IDs unique', () => {
    const flatten = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(flatten) : [];
    const allIds = Object.values(SAAS_TEST_FIXTURE_IDS).flatMap(flatten);
    expect(new Set(allIds)).toHaveLength(allIds.length);
  });

  it('anchors representative past and future appointments to the current UTC day', () => {
    expect(resolveFixtureAppointmentTimes(new Date('2026-07-15T22:30:00.000Z'))).toEqual({
      pastStartAt: '2026-07-08T09:00:00.000Z',
      pastEndAt: '2026-07-08T10:00:00.000Z',
      futureStartAt: '2026-07-22T09:00:00.000Z',
      futureEndAt: '2026-07-22T10:00:00.000Z',
    });
  });

  it('never writes an arbitrary thrown error or secret sentinel to stderr', async () => {
    const stderr: string[] = [];
    const result = await runSaasTestFixtureCli({
      env: { NODE_ENV: 'test' },
      run: async () => {
        throw new Error('SENTINEL_SECRET query=SELECT password_hash params=[secret]');
      },
      writeError: (message) => stderr.push(message),
    });
    expect(result).toBe(1);
    expect(stderr.join('')).toBe('[saas-test-fixture] FAILED\n');
    expect(stderr.join('')).not.toContain('SENTINEL_SECRET');
    expect(stderr.join('')).not.toContain('SELECT');
  });
});
