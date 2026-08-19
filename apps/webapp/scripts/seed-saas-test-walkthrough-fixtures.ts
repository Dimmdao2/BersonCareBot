#!/usr/bin/env tsx
/** Reconciles the deterministic, TEST-only SaaS product walkthrough fixture. */
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { and, count, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  readSaasTestFixturePacket,
  resolveDeployGroupId,
} from '../../../deploy/host/saas-test-fixture-packet.mjs';
import { logServerRuntimeError } from '@/infra/logging/serverRuntimeLog';
import * as schema from '../db/schema';

const REQUIRED_DATABASE = 'bersoncarebot_test';
const PACKET_PATH_ENV = 'SAAS_TEST_FIXTURE_ENV_FILE';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Reserved NANP 555-01xx numbers: valid E.164, non-routable fictional TEST identities. */
export const SAAS_TEST_FIXTURE_PATIENT_PHONES = Object.freeze({
  patientA: '+12025550101',
  patientB: '+12025550102',
});

/**
 * Public booking slugs for the canonical `/book/{publicSlug}` link (owner canon
 * OWNER_RULINGS_2026-07-17.md §1), reconciled onto the same two synthetic clinics so the
 * click-through flow is verifiable on TEST: `/book/saas-test-clinic-a`, `/book/saas-test-clinic-b`.
 */
export const SAAS_TEST_FIXTURE_CLINIC_SLUGS = Object.freeze({
  organizationA: 'saas-test-clinic-a',
  organizationB: 'saas-test-clinic-b',
});

const ids = {
  organizationA: '53000000-0000-4000-8000-0000000000a1',
  organizationB: '53000000-0000-4000-8000-0000000000b1',
  ownerA: '53000000-0000-4000-8000-00000000d0a1',
  ownerB: '53000000-0000-4000-8000-00000000d0b1',
  globalAdmin: '53000000-0000-4000-8000-00000000d001',
  convergenceSentinel: '53000000-0000-4000-8000-00000000ffff',
  doctorsA: ['53000000-0000-4000-8000-00000000d0a2', '53000000-0000-4000-8000-00000000d0a3'],
  specialistsA: [
    '53000000-0000-4000-8000-00000000e0a1',
    '53000000-0000-4000-8000-00000000e0a2',
    '53000000-0000-4000-8000-00000000e0a3',
  ],
  specialistB: '53000000-0000-4000-8000-00000000e0b1',
  membershipsA: [
    '53000000-0000-4000-8000-00000000f0a1',
    '53000000-0000-4000-8000-00000000f0a2',
    '53000000-0000-4000-8000-00000000f0a3',
  ],
  membershipB: '53000000-0000-4000-8000-00000000f0b1',
  patientsA: [
    '53000000-0000-4000-8000-00000000a101',
    '53000000-0000-4000-8000-00000000a102',
    '53000000-0000-4000-8000-00000000a103',
    '53000000-0000-4000-8000-00000000a104',
  ],
  patientsB: ['53000000-0000-4000-8000-00000000a201', '53000000-0000-4000-8000-00000000a202'],
  sharedPatient: '53000000-0000-4000-8000-00000000a301',
  enrollmentsA: [
    '53000000-0000-4000-8000-00000000b101',
    '53000000-0000-4000-8000-00000000b102',
    '53000000-0000-4000-8000-00000000b103',
    '53000000-0000-4000-8000-00000000b104',
    '53000000-0000-4000-8000-00000000b105',
  ],
  enrollmentsB: [
    '53000000-0000-4000-8000-00000000b201',
    '53000000-0000-4000-8000-00000000b202',
    '53000000-0000-4000-8000-00000000b203',
  ],
  services: ['53000000-0000-4000-8000-0000000050a1', '53000000-0000-4000-8000-0000000050b1'],
  branches: ['53000000-0000-4000-8000-0000000051a1', '53000000-0000-4000-8000-0000000051b1'],
  specialistServiceAvailability: [
    '53000000-0000-4000-8000-0000000052a1',
    '53000000-0000-4000-8000-0000000052b1',
  ],
  serviceLocationAvailability: [
    '53000000-0000-4000-8000-0000000053a1',
    '53000000-0000-4000-8000-0000000053b1',
  ],
  workingHours: [
    '53000000-0000-4000-8000-0000000054a1',
    '53000000-0000-4000-8000-0000000054a2',
    '53000000-0000-4000-8000-0000000054a3',
    '53000000-0000-4000-8000-0000000054b1',
  ],
  externalMappings: [
    '53000000-0000-4000-8000-0000000055a1',
    '53000000-0000-4000-8000-0000000055b1',
  ],
  legacyBranchServices: [
    '53000000-0000-4000-8000-0000000056a1',
    '53000000-0000-4000-8000-0000000056b1',
  ],
  mediaFiles: ['53000000-0000-4000-8000-0000000080a1', '53000000-0000-4000-8000-0000000080b1'],
  exerciseMedia: ['53000000-0000-4000-8000-0000000081a1', '53000000-0000-4000-8000-0000000081b1'],
  tariff: '53000000-0000-4000-8000-0000000094a1',
  messageLogs: ['53000000-0000-4000-8000-0000000095a1', '53000000-0000-4000-8000-0000000095b1'],
  appointmentsA: Array.from(
    { length: 10 },
    (_, i) =>
      `53000000-0000-4000-8000-00000000c${i < 5 ? '1' : '2'}${String((i % 5) + 1).padStart(2, '0')}`,
  ),
  appointmentsB: Array.from(
    { length: 6 },
    (_, i) =>
      `53000000-0000-4000-8000-00000000c${i < 3 ? '3' : '4'}${String((i % 3) + 1).padStart(2, '0')}`,
  ),
  subscriptionPackages: [
    '53000000-0000-4000-8000-0000000060a1',
    '53000000-0000-4000-8000-0000000060b1',
  ],
  packageItems: ['53000000-0000-4000-8000-0000000061a1', '53000000-0000-4000-8000-0000000061b1'],
  patientPackages: ['53000000-0000-4000-8000-0000000062a1', '53000000-0000-4000-8000-0000000062b1'],
  patientPackageItems: [
    '53000000-0000-4000-8000-0000000063a1',
    '53000000-0000-4000-8000-0000000063b1',
  ],
  packageUsagesA: [
    '53000000-0000-4000-8000-0000000064a1',
    '53000000-0000-4000-8000-0000000064a2',
    '53000000-0000-4000-8000-0000000064a3',
  ],
  packageUsagesB: ['53000000-0000-4000-8000-0000000064b1', '53000000-0000-4000-8000-0000000064b2'],
  exercisesA: [
    '53000000-0000-4000-8000-0000000070a1',
    '53000000-0000-4000-8000-0000000070a2',
    '53000000-0000-4000-8000-0000000070a3',
    '53000000-0000-4000-8000-0000000070a4',
  ],
  exercisesB: ['53000000-0000-4000-8000-0000000070b1', '53000000-0000-4000-8000-0000000070b2'],
  programInstances: [
    '53000000-0000-4000-8000-0000000071a1',
    '53000000-0000-4000-8000-0000000071b1',
  ],
  programStages: ['53000000-0000-4000-8000-0000000072a1', '53000000-0000-4000-8000-0000000072b1'],
  programGroups: ['53000000-0000-4000-8000-0000000073a1', '53000000-0000-4000-8000-0000000073b1'],
  programItemsA: [
    '53000000-0000-4000-8000-0000000074a1',
    '53000000-0000-4000-8000-0000000074a2',
    '53000000-0000-4000-8000-0000000074a3',
    '53000000-0000-4000-8000-0000000074a4',
  ],
  programItemsB: ['53000000-0000-4000-8000-0000000074b1', '53000000-0000-4000-8000-0000000074b2'],
  programActionsA: Array.from(
    { length: 14 },
    (_, i) => `53000000-0000-4000-8000-0000000075${(0xa1 + i).toString(16)}`,
  ),
  programActionsB: Array.from(
    { length: 4 },
    (_, i) => `53000000-0000-4000-8000-0000000075${(0xb1 + i).toString(16)}`,
  ),
  programEvents: [
    '53000000-0000-4000-8000-0000000076a1',
    '53000000-0000-4000-8000-0000000076a2',
    '53000000-0000-4000-8000-0000000076b1',
    '53000000-0000-4000-8000-0000000076b2',
  ],
} as const;

export const SAAS_TEST_FIXTURE_IDS = Object.freeze(ids);
export const SAAS_TEST_FIXTURE_OPERATOR_REFS = Object.freeze({
  credentials: Object.freeze({
    clinicAOwner: Object.freeze({
      loginRef: 'clinic_a_owner',
      emailPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_EMAIL',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    }),
    clinicADoctor: Object.freeze({
      loginRef: 'clinic_a_doctor',
      email: 'doctor-a2@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    }),
    clinicBOwner: Object.freeze({
      loginRef: 'clinic_b_owner',
      emailPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_B_EMAIL',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD',
    }),
    patientA: Object.freeze({
      loginRef: 'patient_a_representative',
      email: 'patient-a@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    }),
    patientB: Object.freeze({
      loginRef: 'patient_b_representative',
      email: 'patient-b@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD',
    }),
    sharedPatient: Object.freeze({
      loginRef: 'patient_shared_a_b',
      email: 'patient-shared@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    }),
    globalAdmin: Object.freeze({
      loginRef: 'global_admin',
      email: 'global-admin@saas-fixture.test',
      passwordPacketKey: 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    }),
  }),
  contexts: Object.freeze({
    clinicA: Object.freeze({
      organizationId: ids.organizationA,
      representativePatientId: ids.patientsA[0],
      sharedPatientEnrollmentId: ids.enrollmentsA[4],
    }),
    clinicB: Object.freeze({
      organizationId: ids.organizationB,
      representativePatientId: ids.patientsB[0],
      sharedPatientEnrollmentId: ids.enrollmentsB[2],
    }),
    sharedPatient: Object.freeze({ platformUserId: ids.sharedPatient }),
  }),
  publicSurfaces: Object.freeze({
    app: '/app',
    cleanLogin: '/app',
    combinedSpecialistClinicRegistration: '/app',
    publicBooking: '/book',
    devCleanLoginHelper: '/api/auth/dev-public?view=login',
    devSpecialistRegistrationHelper: '/api/auth/dev-public?view=specialist-registration',
    devClinicRegistrationHelper: '/api/auth/dev-public?view=clinic-registration',
  }),
  viewports: Object.freeze({
    desktop: Object.freeze({ width: 1440, height: 900 }),
    mobile: Object.freeze({ width: 390, height: 844 }),
  }),
});
export const SAAS_TEST_FIXTURE_MANIFEST = Object.freeze({
  namespace: 'saas_test_walkthrough',
  version: 2,
  expected: Object.freeze({
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
  }),
  surfaces: Object.freeze({
    sharedPatient: true,
    globalAdmin: true,
    publicBooking: true,
    localMedia: true,
    tariffStorePaymentSafe: true,
    notificationsSendDisabled: true,
    doubleSeedSentinel: true,
  }),
  lockedMatrix: Object.freeze({
    clinicAStaff: Object.freeze({ readA: true, writeA: true, readB: false, writeB: false }),
    clinicBStaff: Object.freeze({ readA: false, writeA: false, readB: true, writeB: true }),
    sharedPatient: Object.freeze({
      readA: true,
      readB: true,
      programWriteA: false,
      programWriteB: false,
    }),
    globalAdmin: Object.freeze({ systemHealth: true, tenantClinicalWrite: false }),
  }),
  reservedPackageDisplayNumbers: Object.freeze([2_053_000_001, 2_053_000_002] as const),
  localMediaPath: '/test-fixtures/saas-exercise.svg',
  operatorRefs: SAAS_TEST_FIXTURE_OPERATOR_REFS,
});

type FixtureOwnerCredentials = Readonly<{ emailNormalized: string; password: string }>;
type FixtureDb = NodePgDatabase<typeof schema>;
export type SaasTestFixtureConfig = Readonly<{
  ownerA: FixtureOwnerCredentials;
  ownerB: FixtureOwnerCredentials;
}>;

function requireSecret(packet: Readonly<Record<string, string>>, key: string): string {
  const value = packet[key]?.trim() ?? '';
  if (!value) throw new Error(`missing_required_secret:${key}`);
  return value;
}

function normalizeEmail(value: string, key: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error(`invalid_email:${key}`);
  if (!normalized.endsWith('.test'))
    throw new Error(`fixture_email_must_use_reserved_test_domain:${key}`);
  return normalized;
}

export function readSaasTestFixtureConfig(
  packet: Readonly<Record<string, string>>,
): SaasTestFixtureConfig {
  const ownerA = {
    emailNormalized: normalizeEmail(
      requireSecret(packet, 'SAAS_TEST_FIXTURE_CLINIC_A_EMAIL'),
      'SAAS_TEST_FIXTURE_CLINIC_A_EMAIL',
    ),
    password: requireSecret(packet, 'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD'),
  };
  const ownerB = {
    emailNormalized: normalizeEmail(
      requireSecret(packet, 'SAAS_TEST_FIXTURE_CLINIC_B_EMAIL'),
      'SAAS_TEST_FIXTURE_CLINIC_B_EMAIL',
    ),
    password: requireSecret(packet, 'SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD'),
  };
  for (const [label, owner] of [
    ['clinic_a', ownerA],
    ['clinic_b', ownerB],
  ] as const) {
    if (owner.password.length < 8 || owner.password.length > 128)
      throw new Error(`invalid_password_length:${label}`);
  }
  if (ownerA.emailNormalized === ownerB.emailNormalized)
    throw new Error('fixture_owner_emails_must_differ');
  return { ownerA, ownerB };
}

function dayStart(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_clock');
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function resolveFixtureAppointmentTimes(now: Date) {
  const start = dayStart(now);
  const hour = 60 * 60 * 1000;
  return {
    pastStartAt: new Date(start - 7 * DAY_MS + 9 * hour).toISOString(),
    pastEndAt: new Date(start - 7 * DAY_MS + 10 * hour).toISOString(),
    futureStartAt: new Date(start + 7 * DAY_MS + 9 * hour).toISOString(),
    futureEndAt: new Date(start + 7 * DAY_MS + 10 * hour).toISOString(),
  };
}

function relativeIso(now: Date, dayOffset: number, hour = 10): string {
  return new Date(dayStart(now) + dayOffset * DAY_MS + hour * 60 * 60 * 1000).toISOString();
}

function localDate(now: Date, dayOffset: number): string {
  return new Date(dayStart(now) + dayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function buildSaasTestFixturePlan(now: Date) {
  const clinicSpecs = [
    {
      key: 'A' as const,
      organizationId: ids.organizationA,
      patientIds: [...ids.patientsA, ids.sharedPatient],
      enrollmentIds: ids.enrollmentsA,
      appointmentIds: ids.appointmentsA,
      specialistIds: ids.specialistsA,
      serviceId: ids.services[0],
      patientPrefix: 'А',
    },
    {
      key: 'B' as const,
      organizationId: ids.organizationB,
      patientIds: [...ids.patientsB, ids.sharedPatient],
      enrollmentIds: ids.enrollmentsB,
      appointmentIds: ids.appointmentsB,
      specialistIds: [ids.specialistB],
      serviceId: ids.services[1],
      patientPrefix: 'Б',
    },
  ];
  const patientCandidates = clinicSpecs.flatMap((clinic) =>
    clinic.patientIds.map((id, index) => {
      const isSharedPatient = id === ids.sharedPatient;
      return {
        id,
        organizationId: clinic.organizationId,
        displayName: isSharedPatient
          ? 'Тестовый общий пациент А/Б'
          : `Тестовый пациент ${clinic.patientPrefix}${index + 1}`,
        firstName: 'Тестовый',
        lastName: isSharedPatient
          ? 'Общий пациент А/Б'
          : `Пациент ${clinic.patientPrefix}${index + 1}`,
        emailNormalized: isSharedPatient
          ? SAAS_TEST_FIXTURE_OPERATOR_REFS.credentials.sharedPatient.email
          : index === 0
            ? `patient-${clinic.key.toLowerCase()}@saas-fixture.test`
            : null,
        phoneNormalized:
          !isSharedPatient && index === 0
            ? clinic.key === 'A'
              ? SAAS_TEST_FIXTURE_PATIENT_PHONES.patientA
              : SAAS_TEST_FIXTURE_PATIENT_PHONES.patientB
            : null,
      };
    }),
  );
  const patients = [...new Map(patientCandidates.map((patient) => [patient.id, patient])).values()];
  const enrollments = clinicSpecs.flatMap((clinic) =>
    clinic.patientIds.map((platformUserId, index) => ({
      id: clinic.enrollmentIds[index]!,
      organizationId: clinic.organizationId,
      platformUserId,
      status: 'active' as const,
    })),
  );
  const appointments = clinicSpecs.flatMap((clinic) =>
    clinic.patientIds.flatMap((platformUserId, index) => {
      const specialistId = clinic.specialistIds[index % clinic.specialistIds.length]!;
      const pastId = clinic.appointmentIds[index]!;
      const futureId = clinic.appointmentIds[index + clinic.patientIds.length]!;
      return [
        {
          id: pastId,
          organizationId: clinic.organizationId,
          specialistId,
          serviceId: clinic.serviceId,
          platformUserId,
          startAt: relativeIso(now, -7, 9 + index),
          endAt: relativeIso(now, -7, 10 + index),
          durationMinutes: 60,
          source: 'admin_manual' as const,
          status: 'completed' as const,
          packageUsageRef: null as string | null,
          attributionJson: {
            fixture: SAAS_TEST_FIXTURE_MANIFEST.namespace,
            version: 2,
            period: 'past',
          },
        },
        {
          id: futureId,
          organizationId: clinic.organizationId,
          specialistId,
          serviceId: clinic.serviceId,
          platformUserId,
          startAt: relativeIso(now, 7, 9 + index),
          endAt: relativeIso(now, 7, 10 + index),
          durationMinutes: 60,
          source: 'admin_manual' as const,
          status: 'confirmed' as const,
          packageUsageRef: null as string | null,
          attributionJson: {
            fixture: SAAS_TEST_FIXTURE_MANIFEST.namespace,
            version: 2,
            period: 'future',
          },
        },
      ];
    }),
  );
  appointments.find((row) => row.id === ids.appointmentsA[0])!.packageUsageRef =
    ids.packageUsagesA[0];
  appointments.find((row) => row.id === ids.appointmentsA[1])!.packageUsageRef =
    ids.packageUsagesA[1];
  appointments.find((row) => row.id === ids.appointmentsA[5])!.packageUsageRef =
    ids.packageUsagesA[2];
  appointments.find((row) => row.id === ids.appointmentsB[0])!.packageUsageRef =
    ids.packageUsagesB[0];
  appointments.find((row) => row.id === ids.appointmentsB[3])!.packageUsageRef =
    ids.packageUsagesB[1];

  const actionSpecsA = [
    ...[-27, -21, -15, -10, -7, -4, -2, 0].map((offset, index) => ({
      itemIndex: 0,
      offset,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        reps: 10 + index * 2,
        sets: 3,
        weightKg: 2 + index * 0.5,
        perceivedDifficulty: (['hard', 'medium', 'easy'] as const)[index % 3],
      },
    })),
    {
      itemIndex: 1,
      offset: -5,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        reps: 15,
        sets: 3,
        perceivedDifficulty: 'medium',
      },
    },
    {
      itemIndex: 1,
      offset: -1,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        reps: 20,
        sets: 3,
        perceivedDifficulty: 'easy',
      },
    },
    {
      itemIndex: 2,
      offset: -3,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        weightKg: 6,
        perceivedDifficulty: 'hard',
      },
    },
    {
      itemIndex: 2,
      offset: 0,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        weightKg: 7,
        perceivedDifficulty: 'medium',
      },
    },
    { itemIndex: 3, offset: -6, payload: { source: 'simple_item_complete', itemType: 'exercise' } },
    {
      itemIndex: 3,
      offset: 0,
      payload: {
        source: 'simple_item_complete',
        itemType: 'exercise',
        perceivedDifficulty: 'easy',
      },
    },
  ];
  const actionLogs = [
    ...actionSpecsA.map((spec, index) => ({
      id: ids.programActionsA[index]!,
      organizationId: ids.organizationA,
      instanceId: ids.programInstances[0],
      instanceStageItemId: ids.programItemsA[spec.itemIndex]!,
      patientUserId: ids.patientsA[0],
      sessionId: null,
      actionType: 'done' as const,
      payload: spec.payload,
      note: null,
      createdAt: relativeIso(now, spec.offset, 11),
    })),
    ...[-6, -3, -1, 0].map((offset, index) => ({
      id: ids.programActionsB[index]!,
      organizationId: ids.organizationB,
      instanceId: ids.programInstances[1],
      instanceStageItemId: ids.programItemsB[index % 2]!,
      patientUserId: ids.patientsB[0],
      sessionId: null,
      actionType: 'done' as const,
      payload:
        index % 2 === 0
          ? { source: 'simple_item_complete', itemType: 'exercise', reps: 12 + index, sets: 2 }
          : { source: 'simple_item_complete', itemType: 'exercise' },
      note: null,
      createdAt: relativeIso(now, offset, 12),
    })),
  ];
  const diarySnapshots = [
    ...Array.from({ length: 14 }, (_, index) => {
      const offset = index - 13;
      const done = Math.max(0, Math.min(4, index % 5));
      return {
        organizationId: ids.organizationA,
        platformUserId: ids.patientsA[0],
        localDate: localDate(now, offset),
        iana: 'Europe/Moscow',
        warmupSlotLimit: 0,
        warmupDoneCount: 0,
        warmupAllDone: true,
        planInstanceId: ids.programInstances[0],
        planItemIds: [...ids.programItemsA],
        planDoneMask: ids.programItemsA.map((_, itemIndex) => itemIndex < done),
        capturedAt: relativeIso(now, offset, 23),
      };
    }),
    ...Array.from({ length: 7 }, (_, index) => {
      const offset = index - 6;
      return {
        organizationId: ids.organizationB,
        platformUserId: ids.patientsB[0],
        localDate: localDate(now, offset),
        iana: 'Europe/Moscow',
        warmupSlotLimit: 0,
        warmupDoneCount: 0,
        warmupAllDone: true,
        planInstanceId: ids.programInstances[1],
        planItemIds: [...ids.programItemsB],
        planDoneMask: [true, index % 2 === 0],
        capturedAt: relativeIso(now, offset, 23),
      };
    }),
  ];
  return {
    clinics: [
      { key: 'A' as const, organizationId: ids.organizationA, patientCount: 5, staffCount: 3 },
      { key: 'B' as const, organizationId: ids.organizationB, patientCount: 3, staffCount: 1 },
    ],
    patients,
    enrollments,
    appointments,
    actionLogs,
    diarySnapshots,
  };
}

export function isReservedDiarySnapshotKey(
  input: { organizationId: string; platformUserId: string; localDate: string },
  now: Date,
): boolean {
  return buildSaasTestFixturePlan(now).diarySnapshots.some(
    (row) =>
      row.organizationId === input.organizationId &&
      row.platformUserId === input.platformUserId &&
      row.localDate === input.localDate,
  );
}

export function isFixtureOwnedDiarySnapshot(input: {
  organizationId: string | null;
  platformUserId: string;
  planInstanceId: string | null;
}): boolean {
  return (
    (input.organizationId === ids.organizationA &&
      input.platformUserId === ids.patientsA[0] &&
      input.planInstanceId === ids.programInstances[0]) ||
    (input.organizationId === ids.organizationB &&
      input.platformUserId === ids.patientsB[0] &&
      input.planInstanceId === ids.programInstances[1])
  );
}

export function assertRequiredDatabaseName(databaseName: string): void {
  if (databaseName !== REQUIRED_DATABASE)
    throw new Error(`refusing_database_target:expected_${REQUIRED_DATABASE}`);
}

export function assertAllowedFixtureDatabaseTarget(input: {
  databaseName: string;
}): void {
  assertRequiredDatabaseName(input.databaseName);
}

async function assertFixtureDatabaseTarget(db: FixtureDb): Promise<void> {
  const result = await db.execute<{ database_name: string }>(
    sql`SELECT current_database()::text AS database_name`,
  );
  assertAllowedFixtureDatabaseTarget({
    databaseName: result.rows[0]?.database_name ?? '',
  });
}

async function hashIfChanged(existingHash: string | null, password: string): Promise<string> {
  if (existingHash) {
    try {
      if (await argon2.verify(existingHash, password)) return existingHash;
    } catch {
      /* reconcile */
    }
  }
  return argon2.hash(password, { type: argon2.argon2id });
}

function assertCount(label: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`fixture_shape_mismatch:${label}:${actual}:${expected}`);
}

async function reconcileFixtures(db: FixtureDb, config: SaasTestFixtureConfig): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const plan = buildSaasTestFixturePlan(now);
  const staff = [
    {
      id: ids.ownerA,
      organizationId: ids.organizationA,
      specialistId: ids.specialistsA[0],
      membershipId: ids.membershipsA[0],
      membershipRole: 'owner' as const,
      displayName: 'Тестовый управляющий клиники А',
      email: config.ownerA.emailNormalized,
      password: config.ownerA.password,
    },
    {
      id: ids.doctorsA[0],
      organizationId: ids.organizationA,
      specialistId: ids.specialistsA[1],
      membershipId: ids.membershipsA[1],
      membershipRole: 'doctor' as const,
      displayName: 'Тестовый специалист Анна',
      email: 'doctor-a2@saas-fixture.test',
      password: config.ownerA.password,
    },
    {
      id: ids.doctorsA[1],
      organizationId: ids.organizationA,
      specialistId: ids.specialistsA[2],
      membershipId: ids.membershipsA[2],
      membershipRole: 'doctor' as const,
      displayName: 'Тестовый специалист Михаил',
      email: 'doctor-a3@saas-fixture.test',
      password: config.ownerA.password,
    },
    {
      id: ids.ownerB,
      organizationId: ids.organizationB,
      specialistId: ids.specialistB,
      membershipId: ids.membershipB,
      membershipRole: 'owner' as const,
      displayName: 'Тестовый соло-специалист Б',
      email: config.ownerB.emailNormalized,
      password: config.ownerB.password,
    },
  ];
  const credentialUsers = [
    ...staff,
    {
      id: ids.patientsA[0],
      email: 'patient-a@saas-fixture.test',
      password: config.ownerA.password,
    },
    {
      id: ids.patientsB[0],
      email: 'patient-b@saas-fixture.test',
      password: config.ownerB.password,
    },
    {
      id: ids.globalAdmin,
      email: 'global-admin@saas-fixture.test',
      password: config.ownerA.password,
    },
    {
      id: ids.sharedPatient,
      email: SAAS_TEST_FIXTURE_OPERATOR_REFS.credentials.sharedPatient.email,
      password: config.ownerA.password,
    },
  ];

  await db.transaction(async (tx) => {
    const snapshotDatesA = plan.diarySnapshots
      .filter((row) => row.organizationId === ids.organizationA)
      .map((row) => row.localDate);
    const snapshotDatesB = plan.diarySnapshots
      .filter((row) => row.organizationId === ids.organizationB)
      .map((row) => row.localDate);
    // Diary dates roll every day. Ownership is carried by the deterministic reserved program
    // instance, so old fixture dates converge without deleting unrelated manual diary rows.
    await tx
      .delete(schema.patientDiaryDaySnapshots)
      .where(
        or(
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationA),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsA[0]),
            eq(schema.patientDiaryDaySnapshots.planInstanceId, ids.programInstances[0]),
          ),
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationB),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsB[0]),
            eq(schema.patientDiaryDaySnapshots.planInstanceId, ids.programInstances[1]),
          ),
        ),
      );
    const manualDiaryCollisions = await tx
      .select({
        organizationId: schema.patientDiaryDaySnapshots.organizationId,
        platformUserId: schema.patientDiaryDaySnapshots.platformUserId,
        localDate: schema.patientDiaryDaySnapshots.localDate,
      })
      .from(schema.patientDiaryDaySnapshots)
      .where(
        or(
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationA),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsA[0]),
            inArray(schema.patientDiaryDaySnapshots.localDate, snapshotDatesA),
          ),
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationB),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsB[0]),
            inArray(schema.patientDiaryDaySnapshots.localDate, snapshotDatesB),
          ),
        ),
      );
    if (manualDiaryCollisions.length > 0) throw new Error('fixture_diary_manual_collision');
    await tx
      .delete(schema.treatmentProgramInstances)
      .where(inArray(schema.treatmentProgramInstances.id, [...ids.programInstances]));
    await tx
      .delete(schema.bePatientPackages)
      .where(inArray(schema.bePatientPackages.id, [...ids.patientPackages]));
    await tx
      .delete(schema.beSubscriptionPackages)
      .where(inArray(schema.beSubscriptionPackages.id, [...ids.subscriptionPackages]));
    await tx
      .delete(schema.beAppointments)
      .where(inArray(schema.beAppointments.id, [...ids.appointmentsA, ...ids.appointmentsB]));
    await tx
      .delete(schema.orgEnrollments)
      .where(inArray(schema.orgEnrollments.id, [...ids.enrollmentsA, ...ids.enrollmentsB]));
    await tx
      .delete(schema.lfkExercises)
      .where(inArray(schema.lfkExercises.id, [...ids.exercisesA, ...ids.exercisesB]));
    await tx
      .delete(schema.beWorkingHours)
      .where(inArray(schema.beWorkingHours.id, [...ids.workingHours]));
    await tx
      .delete(schema.beExternalEntityMappings)
      .where(inArray(schema.beExternalEntityMappings.id, [...ids.externalMappings]));
    await tx
      .delete(schema.beSpecialistServiceAvailability)
      .where(
        inArray(schema.beSpecialistServiceAvailability.id, [...ids.specialistServiceAvailability]),
      );
    await tx
      .delete(schema.beServiceLocationAvailability)
      .where(
        inArray(schema.beServiceLocationAvailability.id, [...ids.serviceLocationAvailability]),
      );
    await tx.delete(schema.beBranches).where(inArray(schema.beBranches.id, [...ids.branches]));
    await tx.delete(schema.saasTariffs).where(eq(schema.saasTariffs.id, ids.tariff));
    await tx
      .delete(schema.lfkExerciseMedia)
      .where(inArray(schema.lfkExerciseMedia.id, [...ids.exerciseMedia]));
    await tx.delete(schema.mediaFiles).where(inArray(schema.mediaFiles.id, [...ids.mediaFiles]));
    await tx.delete(schema.messageLog).where(inArray(schema.messageLog.id, [...ids.messageLogs]));

    for (const [organizationId, title, slug] of [
      [ids.organizationA, 'SaaS TEST Clinic A', SAAS_TEST_FIXTURE_CLINIC_SLUGS.organizationA],
      [ids.organizationB, 'SaaS TEST Solo Clinic B', SAAS_TEST_FIXTURE_CLINIC_SLUGS.organizationB],
    ] as const) {
      await tx
        .insert(schema.beOrganizations)
        .values({ id: organizationId, title, isActive: true, sortOrder: 0, updatedAt: nowIso })
        .onConflictDoUpdate({
          target: schema.beOrganizations.id,
          set: { title, isActive: true, updatedAt: nowIso },
        });
      await tx.execute(sql`SELECT app.seed_reference_catalog_snapshot(${organizationId}::uuid)`);
      // A directory entry is refused unless the organization already holds the slug as its
      // `current` claim (`app.guard_clinic_directory_current_slug`). The claim is what a real
      // signup writes first, so the fixture writes it first too — reconciled, not assumed.
      await tx
        .insert(schema.organizationSlugClaims)
        .values({ organizationId, slug, kind: 'current', updatedAt: nowIso })
        .onConflictDoUpdate({
          target: schema.organizationSlugClaims.organizationId,
          targetWhere: sql`${schema.organizationSlugClaims.kind} = 'current'`,
          set: { slug, updatedAt: nowIso },
        });
      // Canonical public booking link `/book/{publicSlug}` (OWNER_RULINGS_2026-07-17.md §1):
      // reconcile the published directory entry so the demo clinics are click-through-verifiable.
      await tx
        .insert(schema.clinicPublicDirectoryEntries)
        .values({
          organizationId,
          slug,
          displayName: title,
          isPublished: true,
          publishedAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: schema.clinicPublicDirectoryEntries.organizationId,
          set: {
            slug,
            displayName: title,
            isPublished: true,
            publishedAt: nowIso,
            updatedAt: nowIso,
          },
        });
    }

    const globalAdmin = {
      id: ids.globalAdmin,
      displayName: 'Тестовый глобальный администратор',
      email: 'global-admin@saas-fixture.test',
    };
    for (const person of [...staff, ...plan.patients, globalAdmin]) {
      const email = 'email' in person ? person.email : person.emailNormalized;
      const fixturePatientPhone = 'phoneNormalized' in person ? person.phoneNormalized : undefined;
      if (email) {
        const collision = await tx
          .select({ id: schema.platformUsers.id })
          .from(schema.platformUsers)
          .where(
            and(
              eq(schema.platformUsers.emailNormalized, email),
              notInArray(schema.platformUsers.id, [person.id]),
            ),
          )
          .limit(1);
        if (collision[0]) throw new Error('fixture_email_collision');
      }
      const role =
        person.id === ids.globalAdmin
          ? ('admin' as const)
          : 'membershipRole' in person
            ? ('doctor' as const)
            : ('client' as const);
      await tx
        .insert(schema.platformUsers)
        .values({
          id: person.id,
          phoneNormalized: fixturePatientPhone ?? null,
          displayName: person.displayName,
          role,
          firstName: 'firstName' in person ? person.firstName : null,
          lastName: 'lastName' in person ? person.lastName : null,
          email: email ?? null,
          emailNormalized: email ?? null,
          emailVerifiedAt: email ? nowIso : null,
          isBlocked: false,
          blockedAt: null,
          blockedReason: null,
          isArchived: false,
          mergedIntoId: null,
          mergedAt: null,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: schema.platformUsers.id,
          set: {
            displayName: person.displayName,
            role,
            ...(fixturePatientPhone !== undefined ? { phoneNormalized: fixturePatientPhone } : {}),
            firstName: 'firstName' in person ? person.firstName : null,
            lastName: 'lastName' in person ? person.lastName : null,
            email: email ?? null,
            emailNormalized: email ?? null,
            emailVerifiedAt: email ? nowIso : null,
            isBlocked: false,
            isArchived: false,
            mergedIntoId: null,
            mergedAt: null,
            updatedAt: nowIso,
          },
        });
    }

    for (const person of credentialUsers) {
      const existing = await tx
        .select({ passwordHash: schema.userPasswordCredentials.passwordHash })
        .from(schema.userPasswordCredentials)
        .where(eq(schema.userPasswordCredentials.userId, person.id))
        .limit(1);
      const passwordHash = await hashIfChanged(existing[0]?.passwordHash ?? null, person.password);
      await tx
        .insert(schema.userPasswordCredentials)
        .values({ userId: person.id, passwordHash, algo: 'argon2id', updatedAt: nowIso })
        .onConflictDoUpdate({
          target: schema.userPasswordCredentials.userId,
          set: { passwordHash, algo: 'argon2id', updatedAt: nowIso },
        });
    }

    for (const person of staff) {
      await tx
        .insert(schema.beSpecialists)
        .values({
          id: person.specialistId,
          organizationId: person.organizationId,
          fullName: person.displayName,
          description: 'Synthetic TEST fixture v2',
          isActive: true,
          sortOrder: 0,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: schema.beSpecialists.id,
          set: {
            organizationId: person.organizationId,
            fullName: person.displayName,
            description: 'Synthetic TEST fixture v2',
            isActive: true,
            updatedAt: nowIso,
          },
        });
      await tx
        .insert(schema.beOrganizationMembers)
        .values({
          id: person.membershipId,
          organizationId: person.organizationId,
          platformUserId: person.id,
          role: person.membershipRole,
          specialistId: person.specialistId,
          status: 'active',
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: schema.beOrganizationMembers.id,
          set: {
            organizationId: person.organizationId,
            platformUserId: person.id,
            role: person.membershipRole,
            specialistId: person.specialistId,
            status: 'active',
            updatedAt: nowIso,
          },
        });
    }

    const services = [
      {
        id: ids.services[0],
        organizationId: ids.organizationA,
        title: 'Персональная реабилитация',
        description: 'Тестовый приём',
        durationMinutes: 60,
        priceMinor: 450000,
      },
      {
        id: ids.services[1],
        organizationId: ids.organizationB,
        title: 'Соло-консультация',
        description: 'Тестовый приём',
        durationMinutes: 60,
        priceMinor: 300000,
      },
    ];
    for (const service of services)
      await tx
        .insert(schema.beClinicServices)
        .values({ ...service, isActive: true, usableInPackages: true, updatedAt: nowIso })
        .onConflictDoUpdate({
          target: schema.beClinicServices.id,
          set: {
            organizationId: service.organizationId,
            title: service.title,
            description: service.description,
            durationMinutes: 60,
            priceMinor: service.priceMinor,
            isActive: true,
            usableInPackages: true,
            updatedAt: nowIso,
          },
        });
    await tx.insert(schema.beBranches).values([
      {
        id: ids.branches[0],
        organizationId: ids.organizationA,
        title: 'TEST филиал A',
        shortTitle: 'A',
        color: '#2563EB',
        cityCode: 'test-a',
        address: 'Синтетический адрес',
        timezone: 'Europe/Moscow',
        isActive: true,
        sortOrder: 0,
        updatedAt: nowIso,
      },
      {
        id: ids.branches[1],
        organizationId: ids.organizationB,
        title: 'TEST филиал B',
        shortTitle: 'B',
        color: '#16A34A',
        cityCode: 'test-b',
        address: 'Синтетический адрес',
        timezone: 'Europe/Moscow',
        isActive: true,
        sortOrder: 0,
        updatedAt: nowIso,
      },
    ]);
    await tx.insert(schema.beSpecialistServiceAvailability).values([
      {
        id: ids.specialistServiceAvailability[0],
        organizationId: ids.organizationA,
        specialistId: ids.specialistsA[0],
        serviceId: ids.services[0],
        branchId: ids.branches[0],
        roomId: null,
        cityCode: 'test-a',
        isActive: true,
        sortOrder: 0,
        updatedAt: nowIso,
      },
      {
        id: ids.specialistServiceAvailability[1],
        organizationId: ids.organizationB,
        specialistId: ids.specialistB,
        serviceId: ids.services[1],
        branchId: ids.branches[1],
        roomId: null,
        cityCode: 'test-b',
        isActive: true,
        sortOrder: 0,
        updatedAt: nowIso,
      },
    ]);
    await tx.insert(schema.beExternalEntityMappings).values([
      {
        id: ids.externalMappings[0],
        organizationId: ids.organizationA,
        entityType: 'availability',
        canonicalId: ids.specialistServiceAvailability[0],
        externalSystem: 'saas_test_fixture',
        externalId: `saas-fixture:${ids.legacyBranchServices[0]}`,
        metadata: {
          fixture: SAAS_TEST_FIXTURE_MANIFEST.namespace,
          legacy_branch_service_id: ids.legacyBranchServices[0],
        },
        updatedAt: nowIso,
      },
      {
        id: ids.externalMappings[1],
        organizationId: ids.organizationB,
        entityType: 'availability',
        canonicalId: ids.specialistServiceAvailability[1],
        externalSystem: 'saas_test_fixture',
        externalId: `saas-fixture:${ids.legacyBranchServices[1]}`,
        metadata: {
          fixture: SAAS_TEST_FIXTURE_MANIFEST.namespace,
          legacy_branch_service_id: ids.legacyBranchServices[1],
        },
        updatedAt: nowIso,
      },
    ]);
    await tx.insert(schema.beServiceLocationAvailability).values([
      {
        id: ids.serviceLocationAvailability[0],
        organizationId: ids.organizationA,
        serviceId: ids.services[0],
        branchId: ids.branches[0],
        isActive: true,
      },
      {
        id: ids.serviceLocationAvailability[1],
        organizationId: ids.organizationB,
        serviceId: ids.services[1],
        branchId: ids.branches[1],
        isActive: true,
      },
    ]);
    await tx.insert(schema.beWorkingHours).values([
      ...ids.specialistsA.map((specialistId, index) => ({
        id: ids.workingHours[index]!,
        organizationId: ids.organizationA,
        specialistId,
        branchId: ids.branches[0],
        roomId: null,
        weekday: index + 1,
        startMinute: 540,
        endMinute: 1020,
        isActive: true,
        updatedAt: nowIso,
      })),
      {
        id: ids.workingHours[3],
        organizationId: ids.organizationB,
        specialistId: ids.specialistB,
        branchId: ids.branches[1],
        roomId: null,
        weekday: 1,
        startMinute: 540,
        endMinute: 1020,
        isActive: true,
        updatedAt: nowIso,
      },
    ]);
    await tx.insert(schema.orgEnrollments).values(plan.enrollments);
    await tx
      .insert(schema.doctorPatientSupport)
      .values({
        organizationId: ids.organizationA,
        patientUserId: ids.patientsA[0],
        onSupport: true,
        supportStartedAt: relativeIso(now, -30),
        commentsEnabled: true,
        mediaEnabled: true,
        updatedAt: nowIso,
        updatedBy: ids.ownerA,
      })
      .onConflictDoUpdate({
        target: schema.doctorPatientSupport.patientUserId,
        set: {
          organizationId: ids.organizationA,
          onSupport: true,
          supportStartedAt: relativeIso(now, -30),
          commentsEnabled: true,
          mediaEnabled: true,
          updatedAt: nowIso,
          updatedBy: ids.ownerA,
        },
      });
    await tx.insert(schema.beAppointments).values(plan.appointments);

    const packageRoots = [
      {
        organizationId: ids.organizationA,
        patientId: ids.patientsA[0],
        assignedBy: ids.ownerA,
        serviceId: ids.services[0],
        subscriptionId: ids.subscriptionPackages[0],
        packageItemId: ids.packageItems[0],
        patientPackageId: ids.patientPackages[0],
        patientItemId: ids.patientPackageItems[0],
        title: 'Реабилитация — 10 занятий',
        quantity: 10,
        displayNumber: SAAS_TEST_FIXTURE_MANIFEST.reservedPackageDisplayNumbers[0],
        price: 3600000,
        usages: [
          {
            id: ids.packageUsagesA[0],
            appointmentId: ids.appointmentsA[0],
            usageKind: 'consume' as const,
            occurredAt: relativeIso(now, -7, 10),
          },
          {
            id: ids.packageUsagesA[1],
            appointmentId: ids.appointmentsA[1],
            usageKind: 'consume' as const,
            occurredAt: relativeIso(now, -7, 11),
          },
          {
            id: ids.packageUsagesA[2],
            appointmentId: ids.appointmentsA[5],
            usageKind: 'reserve' as const,
            occurredAt: relativeIso(now, -1, 10),
          },
        ],
      },
      {
        organizationId: ids.organizationB,
        patientId: ids.patientsB[0],
        assignedBy: ids.ownerB,
        serviceId: ids.services[1],
        subscriptionId: ids.subscriptionPackages[1],
        packageItemId: ids.packageItems[1],
        patientPackageId: ids.patientPackages[1],
        patientItemId: ids.patientPackageItems[1],
        title: 'Соло-поддержка — 6 занятий',
        quantity: 6,
        displayNumber: SAAS_TEST_FIXTURE_MANIFEST.reservedPackageDisplayNumbers[1],
        price: 1500000,
        usages: [
          {
            id: ids.packageUsagesB[0],
            appointmentId: ids.appointmentsB[0],
            usageKind: 'consume' as const,
            occurredAt: relativeIso(now, -7, 10),
          },
          {
            id: ids.packageUsagesB[1],
            appointmentId: ids.appointmentsB[3],
            usageKind: 'reserve' as const,
            occurredAt: relativeIso(now, -1, 10),
          },
        ],
      },
    ];
    for (const pkg of packageRoots) {
      const displayCollision = await tx
        .select({ id: schema.bePatientPackages.id })
        .from(schema.bePatientPackages)
        .where(
          and(
            eq(schema.bePatientPackages.displayNumber, pkg.displayNumber),
            notInArray(schema.bePatientPackages.id, [...ids.patientPackages]),
          ),
        )
        .limit(1);
      if (displayCollision[0]) throw new Error('fixture_package_display_number_collision');
      await tx.insert(schema.beSubscriptionPackages).values({
        id: pkg.subscriptionId,
        organizationId: pkg.organizationId,
        title: pkg.title,
        description: 'Synthetic TEST fixture v2',
        priceMinor: pkg.price,
        currency: 'RUB',
        validityDays: 120,
        deductionMode: 'auto_on_visit_confirmed',
        isActive: true,
        updatedAt: nowIso,
      });
      await tx.insert(schema.bePackageItems).values({
        id: pkg.packageItemId,
        packageId: pkg.subscriptionId,
        serviceId: pkg.serviceId,
        quantity: pkg.quantity,
        sortOrder: 0,
      });
      await tx.insert(schema.bePatientPackages).values({
        id: pkg.patientPackageId,
        organizationId: pkg.organizationId,
        platformUserId: pkg.patientId,
        subscriptionPackageId: pkg.subscriptionId,
        status: 'active',
        displayNumber: pkg.displayNumber,
        title: pkg.title,
        priceMinor: pkg.price,
        currency: 'RUB',
        validityDays: 120,
        validFrom: relativeIso(now, -30),
        validUntil: relativeIso(now, 90),
        deductionMode: 'auto_on_visit_confirmed',
        soldAt: relativeIso(now, -30),
        paidAmountMinor: pkg.price,
        paidCurrency: 'RUB',
        assignedByPlatformUserId: pkg.assignedBy,
        notes: `${SAAS_TEST_FIXTURE_MANIFEST.namespace}:v2`,
        updatedAt: nowIso,
      });
      await tx.insert(schema.bePatientPackageItems).values({
        id: pkg.patientItemId,
        patientPackageId: pkg.patientPackageId,
        serviceId: pkg.serviceId,
        quantityInitial: pkg.quantity,
        sortOrder: 0,
      });
      await tx.insert(schema.bePackageUsages).values(
        pkg.usages.map((usage) => ({
          ...usage,
          organizationId: pkg.organizationId,
          patientPackageId: pkg.patientPackageId,
          patientPackageItemId: pkg.patientItemId,
          quantity: 1,
          comment: 'Synthetic TEST fixture v2',
          createdByPlatformUserId: pkg.assignedBy,
        })),
      );
    }

    const exerciseSpecs = [
      ...[
        'Приседание с опорой',
        'Ягодичный мост без веса',
        'Удержание с весом',
        'Спокойная ходьба',
      ].map((title, index) => ({
        id: ids.exercisesA[index]!,
        organizationId: ids.organizationA,
        title,
        description: 'Тестовое упражнение для проверки интерфейса',
        loadType: (['strength', 'strength', 'static_hold', 'cardio'] as const)[index],
        difficulty110: index + 3,
        createdBy: ids.ownerA,
      })),
      ...['Подъём на носки', 'Дыхательная практика'].map((title, index) => ({
        id: ids.exercisesB[index]!,
        organizationId: ids.organizationB,
        title,
        description: 'Тестовое упражнение соло-клиники',
        loadType: index === 0 ? 'strength' : 'other',
        difficulty110: index + 2,
        createdBy: ids.ownerB,
      })),
    ];
    await tx.insert(schema.lfkExercises).values(
      exerciseSpecs.map((row) => ({
        ...row,
        contraindications: 'При боли остановиться',
        tags: ['test-fixture-v2'],
        isArchived: false,
        updatedAt: nowIso,
      })),
    );
    await tx.insert(schema.mediaFiles).values([
      {
        id: ids.mediaFiles[0],
        organizationId: ids.organizationA,
        originalName: 'saas-exercise.svg',
        storedPath: SAAS_TEST_FIXTURE_MANIFEST.localMediaPath,
        mimeType: 'image/svg+xml',
        sizeBytes: 1068,
        uploadedBy: ids.ownerA,
        s3Key: null,
        status: 'ready',
        displayName: 'Локальная TEST-иллюстрация A',
        previewStatus: 'skipped',
        videoProcessingStatus: null,
        videoDeliveryOverride: null,
      },
      {
        id: ids.mediaFiles[1],
        organizationId: ids.organizationB,
        originalName: 'saas-exercise.svg',
        storedPath: SAAS_TEST_FIXTURE_MANIFEST.localMediaPath,
        mimeType: 'image/svg+xml',
        sizeBytes: 1068,
        uploadedBy: ids.ownerB,
        s3Key: null,
        status: 'ready',
        displayName: 'Локальная TEST-иллюстрация B',
        previewStatus: 'skipped',
        videoProcessingStatus: null,
        videoDeliveryOverride: null,
      },
    ]);
    await tx.insert(schema.lfkExerciseMedia).values([
      {
        id: ids.exerciseMedia[0],
        organizationId: ids.organizationA,
        exerciseId: ids.exercisesA[0],
        mediaUrl: `/api/media/${ids.mediaFiles[0]}`,
        mediaType: 'image',
        sortOrder: 0,
      },
      {
        id: ids.exerciseMedia[1],
        organizationId: ids.organizationB,
        exerciseId: ids.exercisesB[0],
        mediaUrl: `/api/media/${ids.mediaFiles[1]}`,
        mediaType: 'image',
        sortOrder: 0,
      },
    ]);
    await tx.insert(schema.saasTariffs).values({
      id: ids.tariff,
      name: 'TEST Development',
      description: 'Synthetic non-billable tariff',
      priceMinor: 0,
      currency: 'RUB',
      mechanics: { booking: true, programs: true, messaging: true },
      isActive: true,
      updatedAt: nowIso,
    });
    await tx
      .insert(schema.userNotificationTopics)
      .values([
        {
          userId: ids.patientsA[0],
          topicCode: 'appointments',
          isEnabled: false,
          updatedAt: nowIso,
        },
        {
          userId: ids.patientsB[0],
          topicCode: 'appointments',
          isEnabled: false,
          updatedAt: nowIso,
        },
      ])
      .onConflictDoUpdate({
        target: [schema.userNotificationTopics.userId, schema.userNotificationTopics.topicCode],
        set: { isEnabled: false, updatedAt: nowIso },
      });
    await tx.insert(schema.messageLog).values([
      {
        id: ids.messageLogs[0],
        organizationId: ids.organizationA,
        userId: 'fixture-patient-a',
        senderId: 'fixture_noop',
        text: 'Синтетическое уведомление без доставки',
        category: 'appointment',
        channelBindingsUsed: {},
        sentAt: relativeIso(now, -2),
        outcome: 'failed',
        errorMessage: 'fixture_delivery_disabled',
        platformUserId: ids.patientsA[0],
      },
      {
        id: ids.messageLogs[1],
        organizationId: ids.organizationB,
        userId: 'fixture-patient-b',
        senderId: 'fixture_noop',
        text: 'Синтетическое уведомление без доставки',
        category: 'appointment',
        channelBindingsUsed: {},
        sentAt: relativeIso(now, -2),
        outcome: 'failed',
        errorMessage: 'fixture_delivery_disabled',
        platformUserId: ids.patientsB[0],
      },
    ]);

    const programs = [
      {
        organizationId: ids.organizationA,
        patientId: ids.patientsA[0],
        assignedBy: ids.ownerA,
        instanceId: ids.programInstances[0],
        stageId: ids.programStages[0],
        groupId: ids.programGroups[0],
        itemIds: ids.programItemsA,
        exercises: exerciseSpecs.slice(0, 4),
        title: 'Программа восстановления колена',
        assignedDayOffset: -30,
        actionLatest: relativeIso(now, 0, 11),
      },
      {
        organizationId: ids.organizationB,
        patientId: ids.patientsB[0],
        assignedBy: ids.ownerB,
        instanceId: ids.programInstances[1],
        stageId: ids.programStages[1],
        groupId: ids.programGroups[1],
        itemIds: ids.programItemsB,
        exercises: exerciseSpecs.slice(4, 6),
        title: 'Соло-программа мобильности',
        assignedDayOffset: -20,
        actionLatest: relativeIso(now, 0, 12),
      },
    ];
    for (const program of programs) {
      await tx.insert(schema.treatmentProgramInstances).values({
        id: program.instanceId,
        organizationId: program.organizationId,
        templateId: null,
        patientUserId: program.patientId,
        assignedBy: program.assignedBy,
        title: program.title,
        status: 'active',
        assignmentSource: 'doctor',
        createdAt: relativeIso(now, program.assignedDayOffset),
        patientPlanLastOpenedAt: relativeIso(now, -1),
        updatedAt: nowIso,
      });
      await tx.insert(schema.treatmentProgramInstanceStages).values({
        id: program.stageId,
        organizationId: program.organizationId,
        instanceId: program.instanceId,
        sourceStageId: null,
        title: 'Основной этап',
        description: 'Регулярная практика и контроль динамики',
        sortOrder: 1,
        status: 'in_progress',
        startedAt: relativeIso(now, program.assignedDayOffset),
        goals: 'Вернуть уверенность в движении',
        objectives: 'Выполнять упражнения регулярно',
        expectedDurationDays: 30,
        expectedDurationText: '4 недели',
      });
      await tx.insert(schema.treatmentProgramInstanceStageGroups).values({
        id: program.groupId,
        organizationId: program.organizationId,
        stageId: program.stageId,
        title: 'Ежедневный комплекс',
        description: 'Разные варианты нагрузки для проверки интерфейса',
        scheduleText: 'Ежедневно',
        sortOrder: 0,
        systemKind: null,
      });
      await tx.insert(schema.treatmentProgramInstanceStageItems).values(
        program.exercises.map((exercise, index) => ({
          id: program.itemIds[index]!,
          organizationId: program.organizationId,
          stageId: program.stageId,
          itemType: 'exercise',
          itemRefId: exercise.id,
          sortOrder: index,
          comment: index === 0 ? 'Следить за техникой и самочувствием' : null,
          localComment: null,
          settings: index < 2 ? { reps: index === 0 ? 12 : 15, sets: 3 } : {},
          snapshot: {
            itemType: 'exercise',
            id: exercise.id,
            title: exercise.title,
            description: exercise.description,
            contraindications: 'При боли остановиться',
            difficulty: exercise.difficulty110,
            loadType: exercise.loadType,
          },
          completedAt: program.actionLatest,
          isActionable: null,
          status: 'active',
          groupId: program.groupId,
          createdAt: relativeIso(now, program.assignedDayOffset),
          lastViewedAt: relativeIso(now, -1),
        })),
      );
    }
    await tx.insert(schema.programActionLog).values(plan.actionLogs);
    await tx.insert(schema.treatmentProgramEvents).values([
      {
        id: ids.programEvents[0],
        organizationId: ids.organizationA,
        instanceId: ids.programInstances[0],
        actorId: ids.ownerA,
        eventType: 'program_changed',
        targetType: 'program',
        targetId: ids.programInstances[0],
        payload: { fixture: 'v2', change: 'assigned' },
        createdAt: relativeIso(now, -30),
      },
      {
        id: ids.programEvents[1],
        organizationId: ids.organizationA,
        instanceId: ids.programInstances[0],
        actorId: ids.patientsA[0],
        eventType: 'status_changed',
        targetType: 'stage_item',
        targetId: ids.programItemsA[0],
        payload: { field: 'completedAt' },
        createdAt: relativeIso(now, -2),
      },
      {
        id: ids.programEvents[2],
        organizationId: ids.organizationB,
        instanceId: ids.programInstances[1],
        actorId: ids.ownerB,
        eventType: 'program_changed',
        targetType: 'program',
        targetId: ids.programInstances[1],
        payload: { fixture: 'v2', change: 'assigned' },
        createdAt: relativeIso(now, -20),
      },
      {
        id: ids.programEvents[3],
        organizationId: ids.organizationB,
        instanceId: ids.programInstances[1],
        actorId: ids.patientsB[0],
        eventType: 'status_changed',
        targetType: 'stage_item',
        targetId: ids.programItemsB[0],
        payload: { field: 'completedAt' },
        createdAt: relativeIso(now, -1),
      },
    ]);
    await tx.insert(schema.patientDiaryDaySnapshots).values(plan.diarySnapshots);

    const fixtureStaff = await tx
      .select({ value: count() })
      .from(schema.beOrganizationMembers)
      .where(inArray(schema.beOrganizationMembers.id, [...ids.membershipsA, ids.membershipB]));
    assertCount('staff', fixtureStaff[0]?.value ?? 0, 4);
    const clinicAStaff = await tx
      .select({ value: count() })
      .from(schema.beOrganizationMembers)
      .where(
        and(
          inArray(schema.beOrganizationMembers.id, [...ids.membershipsA]),
          eq(schema.beOrganizationMembers.organizationId, ids.organizationA),
          eq(schema.beOrganizationMembers.status, 'active'),
        ),
      );
    assertCount('clinic_a_staff', clinicAStaff[0]?.value ?? 0, 3);
    const clinicBStaff = await tx
      .select({ value: count() })
      .from(schema.beOrganizationMembers)
      .where(
        and(
          eq(schema.beOrganizationMembers.id, ids.membershipB),
          eq(schema.beOrganizationMembers.organizationId, ids.organizationB),
          eq(schema.beOrganizationMembers.status, 'active'),
        ),
      );
    assertCount('clinic_b_staff', clinicBStaff[0]?.value ?? 0, 1);
    const fixtureEnrollments = await tx
      .select({ value: count() })
      .from(schema.orgEnrollments)
      .where(inArray(schema.orgEnrollments.id, [...ids.enrollmentsA, ...ids.enrollmentsB]));
    assertCount('patients', fixtureEnrollments[0]?.value ?? 0, 8);
    const fixtureSupportProfiles = await tx
      .select({ value: count() })
      .from(schema.doctorPatientSupport)
      .where(
        and(
          eq(schema.doctorPatientSupport.organizationId, ids.organizationA),
          eq(schema.doctorPatientSupport.patientUserId, ids.patientsA[0]),
          eq(schema.doctorPatientSupport.onSupport, true),
          eq(schema.doctorPatientSupport.commentsEnabled, true),
          eq(schema.doctorPatientSupport.mediaEnabled, true),
        ),
      );
    assertCount('support_profiles', fixtureSupportProfiles[0]?.value ?? 0, 1);
    const clinicAPatients = await tx
      .select({ value: count() })
      .from(schema.orgEnrollments)
      .where(
        and(
          inArray(schema.orgEnrollments.id, [...ids.enrollmentsA]),
          eq(schema.orgEnrollments.organizationId, ids.organizationA),
          eq(schema.orgEnrollments.status, 'active'),
        ),
      );
    assertCount('clinic_a_patients', clinicAPatients[0]?.value ?? 0, 5);
    const clinicBPatients = await tx
      .select({ value: count() })
      .from(schema.orgEnrollments)
      .where(
        and(
          inArray(schema.orgEnrollments.id, [...ids.enrollmentsB]),
          eq(schema.orgEnrollments.organizationId, ids.organizationB),
          eq(schema.orgEnrollments.status, 'active'),
        ),
      );
    assertCount('clinic_b_patients', clinicBPatients[0]?.value ?? 0, 3);
    const fixtureAppointments = await tx
      .select({ value: count() })
      .from(schema.beAppointments)
      .where(inArray(schema.beAppointments.id, [...ids.appointmentsA, ...ids.appointmentsB]));
    assertCount('appointments', fixtureAppointments[0]?.value ?? 0, 16);
    const fixtureActions = await tx
      .select({ value: count() })
      .from(schema.programActionLog)
      .where(inArray(schema.programActionLog.id, [...ids.programActionsA, ...ids.programActionsB]));
    assertCount('program_actions', fixtureActions[0]?.value ?? 0, 18);
    const fixtureCredentials = await tx
      .select({ value: count() })
      .from(schema.userPasswordCredentials)
      .where(
        inArray(
          schema.userPasswordCredentials.userId,
          credentialUsers.map((row) => row.id),
        ),
      );
    assertCount('login_credentials', fixtureCredentials[0]?.value ?? 0, 8);
    const fixturePackages = await tx
      .select({ value: count() })
      .from(schema.bePatientPackages)
      .where(inArray(schema.bePatientPackages.id, [...ids.patientPackages]));
    assertCount('patient_packages', fixturePackages[0]?.value ?? 0, 2);
    const fixturePackageUsages = await tx
      .select({
        usageKind: schema.bePackageUsages.usageKind,
        quantity: schema.bePackageUsages.quantity,
      })
      .from(schema.bePackageUsages)
      .where(inArray(schema.bePackageUsages.id, [...ids.packageUsagesA, ...ids.packageUsagesB]));
    assertCount('package_usages', fixturePackageUsages.length, 5);
    assertCount(
      'package_consumed_quantity',
      fixturePackageUsages
        .filter((row) => row.usageKind === 'consume')
        .reduce((sum, row) => sum + row.quantity, 0),
      3,
    );
    assertCount(
      'package_reserved_quantity',
      fixturePackageUsages
        .filter((row) => row.usageKind === 'reserve')
        .reduce((sum, row) => sum + row.quantity, 0),
      2,
    );
    const fixturePrograms = await tx
      .select({ value: count() })
      .from(schema.treatmentProgramInstances)
      .where(inArray(schema.treatmentProgramInstances.id, [...ids.programInstances]));
    assertCount('program_instances', fixturePrograms[0]?.value ?? 0, 2);
    const fixtureProgramHistoryShape = await tx.execute<{
      program_count: number;
      pipeline_stage_count: number;
      created_before_first_action_count: number;
      created_before_first_snapshot_count: number;
      child_items_after_parent_count: number;
      child_items_before_first_action_count: number;
      child_items_before_first_snapshot_count: number;
    }>(sql`
      SELECT
        count(*)::int AS program_count,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM treatment_program_instance_stages stage
          WHERE stage.instance_id = instance.id
            AND stage.sort_order > 0
        ))::int AS pipeline_stage_count,
        count(*) FILTER (WHERE instance.created_at <= (
          SELECT min(action.created_at)
          FROM program_action_log action
          WHERE action.instance_id = instance.id
            AND action.patient_user_id = instance.patient_user_id
        ))::int AS created_before_first_action_count,
        count(*) FILTER (WHERE instance.created_at <= (
          SELECT min(snapshot.captured_at)
          FROM patient_diary_day_snapshots snapshot
          WHERE snapshot.plan_instance_id = instance.id
            AND snapshot.platform_user_id = instance.patient_user_id
            AND snapshot.organization_id = instance.organization_id
        ))::int AS created_before_first_snapshot_count,
        count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1
          FROM treatment_program_instance_stages stage
          JOIN treatment_program_instance_stage_items item ON item.stage_id = stage.id
          WHERE stage.instance_id = instance.id
            AND item.created_at < instance.created_at
        ))::int AS child_items_after_parent_count,
        count(*) FILTER (WHERE (
          SELECT max(item.created_at)
          FROM treatment_program_instance_stages stage
          JOIN treatment_program_instance_stage_items item ON item.stage_id = stage.id
          WHERE stage.instance_id = instance.id
        ) <= (
          SELECT min(action.created_at)
          FROM program_action_log action
          WHERE action.instance_id = instance.id
            AND action.patient_user_id = instance.patient_user_id
        ))::int AS child_items_before_first_action_count,
        count(*) FILTER (WHERE (
          SELECT max(item.created_at)
          FROM treatment_program_instance_stages stage
          JOIN treatment_program_instance_stage_items item ON item.stage_id = stage.id
          WHERE stage.instance_id = instance.id
        ) <= (
          SELECT min(snapshot.captured_at)
          FROM patient_diary_day_snapshots snapshot
          WHERE snapshot.plan_instance_id = instance.id
            AND snapshot.platform_user_id = instance.patient_user_id
            AND snapshot.organization_id = instance.organization_id
        ))::int AS child_items_before_first_snapshot_count
      FROM treatment_program_instances instance
      WHERE instance.id IN (${sql.join(
        ids.programInstances.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `);
    const programHistoryShape = fixtureProgramHistoryShape.rows[0];
    assertCount('program_history_shape', programHistoryShape?.program_count ?? 0, 2);
    assertCount('program_pipeline_stages', programHistoryShape?.pipeline_stage_count ?? 0, 2);
    assertCount(
      'program_created_before_first_action',
      programHistoryShape?.created_before_first_action_count ?? 0,
      2,
    );
    assertCount(
      'program_created_before_first_snapshot',
      programHistoryShape?.created_before_first_snapshot_count ?? 0,
      2,
    );
    assertCount(
      'program_child_items_after_parent',
      programHistoryShape?.child_items_after_parent_count ?? 0,
      2,
    );
    assertCount(
      'program_child_items_before_first_action',
      programHistoryShape?.child_items_before_first_action_count ?? 0,
      2,
    );
    assertCount(
      'program_child_items_before_first_snapshot',
      programHistoryShape?.child_items_before_first_snapshot_count ?? 0,
      2,
    );
    const fixtureProgramEvents = await tx
      .select({ value: count() })
      .from(schema.treatmentProgramEvents)
      .where(inArray(schema.treatmentProgramEvents.id, [...ids.programEvents]));
    assertCount('program_events', fixtureProgramEvents[0]?.value ?? 0, 4);
    const fixtureSnapshots = await tx
      .select({ value: count() })
      .from(schema.patientDiaryDaySnapshots)
      .where(
        or(
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationA),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsA[0]),
            inArray(schema.patientDiaryDaySnapshots.localDate, snapshotDatesA),
          ),
          and(
            eq(schema.patientDiaryDaySnapshots.organizationId, ids.organizationB),
            eq(schema.patientDiaryDaySnapshots.platformUserId, ids.patientsB[0]),
            inArray(schema.patientDiaryDaySnapshots.localDate, snapshotDatesB),
          ),
        ),
      );
    assertCount('diary_snapshots', fixtureSnapshots[0]?.value ?? 0, 21);

    const bookingProof = await tx.execute<{ mapping_count: number; schedulable_count: number }>(sql`
      SELECT
        count(*)::int AS mapping_count,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM generate_series(current_date, current_date + 13, interval '1 day') AS day(candidate_date)
          CROSS JOIN LATERAL generate_series(
            wh.start_minute,
            wh.end_minute - svc.duration_minutes,
            svc.duration_minutes
          ) AS slot(slot_minute)
          WHERE wh.is_active = true
            AND extract(dow FROM day.candidate_date)::int = wh.weekday
            AND NOT EXISTS (
              SELECT 1
              FROM be_appointments appointment
              WHERE appointment.organization_id = map.organization_id
                AND appointment.specialist_id = ssa.specialist_id
                AND appointment.deleted_at IS NULL
                AND appointment.status IN (
                  'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
                  'manual_review_required'
                )
                AND appointment.end_at > ((
                  day.candidate_date::date + make_interval(mins => slot.slot_minute)
                ) AT TIME ZONE branch.timezone)
                AND appointment.start_at < ((
                  day.candidate_date::date + make_interval(
                    mins => slot.slot_minute + svc.duration_minutes
                  )
                ) AT TIME ZONE branch.timezone)
            )
        ))::int AS schedulable_count
      FROM be_external_entity_mappings map
      JOIN be_specialist_service_availability ssa
        ON ssa.id = map.canonical_id
       AND ssa.organization_id = map.organization_id
       AND ssa.is_active = true
      JOIN be_branches branch
        ON branch.id = ssa.branch_id
       AND branch.organization_id = map.organization_id
       AND branch.is_active = true
      JOIN be_clinic_services svc
        ON svc.id = ssa.service_id
       AND svc.organization_id = map.organization_id
       AND svc.is_active = true
      JOIN be_working_hours wh
        ON wh.organization_id = map.organization_id
       AND wh.specialist_id = ssa.specialist_id
       AND wh.branch_id = ssa.branch_id
      WHERE map.id IN (${sql.join(
        ids.externalMappings.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        AND map.entity_type = 'availability'
        AND map.metadata->>'legacy_branch_service_id' IN (${sql.join(
          ids.legacyBranchServices.map((id) => sql`${id}`),
          sql`, `,
        )})
    `);
    assertCount('public_booking_mappings', bookingProof.rows[0]?.mapping_count ?? 0, 2);
    assertCount(
      'public_booking_schedulable_contexts',
      bookingProof.rows[0]?.schedulable_count ?? 0,
      2,
    );

    const safeSurfaceProof = await tx.execute<{
      global_admin_count: number;
      shared_patient_login_count: number;
      registration_setting_count: number;
      local_media_count: number;
      tariff_count: number;
      disabled_notification_count: number;
      send_safe_message_count: number;
      fixture_outbox_count: number;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM platform_users
          WHERE id = ${ids.globalAdmin}::uuid AND role = 'admin' AND is_blocked = false) AS global_admin_count,
        (SELECT count(*)::int
          FROM platform_users pu
          JOIN user_password_credentials credential ON credential.user_id = pu.id
          WHERE pu.id = ${ids.sharedPatient}::uuid
            AND pu.role = 'client'
            AND pu.email_normalized = ${SAAS_TEST_FIXTURE_OPERATOR_REFS.credentials.sharedPatient.email}
            AND pu.is_blocked = false) AS shared_patient_login_count,
        (SELECT count(*)::int FROM public.system_settings
          WHERE key = 'specialist_signup_enabled'
            AND scope = 'admin'
            AND organization_id IS NULL
            AND value_json = '{"value":true}'::jsonb) AS registration_setting_count,
        (SELECT count(*)::int FROM media_files
          WHERE id IN (${sql.join(
            ids.mediaFiles.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
            AND s3_key IS NULL
            AND stored_path = ${SAAS_TEST_FIXTURE_MANIFEST.localMediaPath}
            AND mime_type = 'image/svg+xml'
            AND status = 'ready') AS local_media_count,
        (SELECT count(*)::int FROM saas_tariffs
          WHERE id = ${ids.tariff}::uuid
            AND is_active = true
            AND price_minor = 0
            AND currency = 'RUB') AS tariff_count,
        (SELECT count(*)::int FROM user_notification_topics
          WHERE user_id IN (${sql.join(
            [ids.patientsA[0], ids.patientsB[0]].map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
            AND topic_code = 'appointments'
            AND is_enabled = false) AS disabled_notification_count,
        (SELECT count(*)::int FROM message_log
          WHERE id IN (${sql.join(
            ids.messageLogs.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
            AND sender_id = 'fixture_noop'
            AND outcome = 'failed'
            AND error_message = 'fixture_delivery_disabled') AS send_safe_message_count,
        (
          (SELECT count(*) FROM outgoing_delivery_queue
            WHERE event_id LIKE 'saas-fixture:%'
               OR payload_json::text LIKE '%saas_test_walkthrough%')
          + (SELECT count(*) FROM integrator_push_outbox
            WHERE idempotency_key LIKE 'saas-fixture:%'
               OR payload::text LIKE '%saas_test_walkthrough%')
          + (SELECT count(*) FROM integrator.projection_outbox
            WHERE idempotency_key LIKE 'saas-fixture:%'
               OR payload::text LIKE '%saas_test_walkthrough%')
        )::int AS fixture_outbox_count
    `);
    const safeProof = safeSurfaceProof.rows[0];
    assertCount('global_admin', safeProof?.global_admin_count ?? 0, 1);
    assertCount('shared_patient_login', safeProof?.shared_patient_login_count ?? 0, 1);
    assertCount('registration_settings_mirrored', safeProof?.registration_setting_count ?? 0, 2);
    assertCount('local_media', safeProof?.local_media_count ?? 0, 2);
    assertCount('tariff', safeProof?.tariff_count ?? 0, 1);
    assertCount('disabled_notifications', safeProof?.disabled_notification_count ?? 0, 2);
    assertCount('send_safe_messages', safeProof?.send_safe_message_count ?? 0, 2);
    assertCount('fixture_outbox_jobs', safeProof?.fixture_outbox_count ?? 0, 0);
  });
}

async function proveDoubleSeedConvergence(
  db: FixtureDb,
  config: SaasTestFixtureConfig,
): Promise<void> {
  await db.delete(schema.platformUsers).where(eq(schema.platformUsers.id, ids.convergenceSentinel));
  await db.insert(schema.platformUsers).values({
    id: ids.convergenceSentinel,
    displayName: 'SaaS fixture convergence sentinel',
    role: 'client',
    isBlocked: false,
    isArchived: false,
    updatedAt: new Date().toISOString(),
  });
  try {
    await reconcileFixtures(db, config);
    await reconcileFixtures(db, config);
    const sentinel = await db
      .select({ value: count() })
      .from(schema.platformUsers)
      .where(eq(schema.platformUsers.id, ids.convergenceSentinel));
    assertCount('double_seed_unrelated_sentinel', sentinel[0]?.value ?? 0, 1);
  } finally {
    await db
      .delete(schema.platformUsers)
      .where(eq(schema.platformUsers.id, ids.convergenceSentinel));
  }
}

export async function runSaasTestFixtureSeeder(env: NodeJS.ProcessEnv): Promise<void> {
  const packetPath = env[PACKET_PATH_ENV]?.trim() ?? '';
  if (!packetPath) throw new Error('fixture_packet_path_required');
  const config = readSaasTestFixtureConfig(
    readSaasTestFixturePacket({
      filePath: packetPath,
      expectedGroupId: resolveDeployGroupId(),
    }),
  );
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) throw new Error('fixture_database_url_required');
  const pgOptions = env.PGOPTIONS?.trim();
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(pgOptions ? { options: pgOptions } : {}),
  });
  const db = drizzle(pool, { schema });
  try {
    await assertFixtureDatabaseTarget(db);
    if (env.SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF === '1') {
      await proveDoubleSeedConvergence(db, config);
    } else {
      await reconcileFixtures(db, config);
    }
  } finally {
    await pool.end();
  }
  console.log(
    `[saas-test-fixture] OK: manifest v2; Clinic A staff=3 patients=5; Clinic B staff=1 patients=3; appointments, memberships, programs and progress reconciled; doubleRun=${env.SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF === '1'}`,
  );
}

export async function runSaasTestFixtureCli(options: {
  env: NodeJS.ProcessEnv;
  run?: (env: NodeJS.ProcessEnv) => Promise<void>;
  writeError?: (message: string) => void;
}): Promise<number> {
  const run = options.run ?? runSaasTestFixtureSeeder;
  const writeError = options.writeError ?? ((message: string) => process.stderr.write(message));
  try {
    await run(options.env);
    return 0;
  } catch (error) {
    // Never write the raw thrown error to stderr: it can carry SQL text and bound
    // parameters (e.g. a failing query naming password_hash). Log a safe, value-free
    // summary plus a correlation digest via the shared runtime-error logger (OWASP
    // ASVS V7 / CWE-209), and keep the CLI's own stderr contract to a bare, stable
    // failure line so operators get a diagnosable digest without a secret-leak vector.
    logServerRuntimeError('saas-test-fixture-cli', error);
    writeError(`[saas-test-fixture] FAILED\n`);
    return 1;
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(await runSaasTestFixtureCli({ env: process.env }));
