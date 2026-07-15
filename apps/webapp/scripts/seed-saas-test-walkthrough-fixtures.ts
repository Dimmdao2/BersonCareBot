#!/usr/bin/env tsx
/**
 * Reconciles the TEST-only A/B clinic fixture used by the SaaS S3 walkthrough.
 *
 * The script has no network/delivery path. It writes only deterministic synthetic rows in
 * `bersoncarebot_test`, and refuses to start unless the operator explicitly enables it and supplies
 * both owner credentials through a protected external env packet.
 */
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  readSaasTestFixturePacket,
  resolveDeployGroupId,
} from "../../../deploy/host/saas-test-fixture-packet.mjs";
import * as schema from "../db/schema";
import {
  beAppointments,
  beOrganizationMembers,
  beOrganizations,
  beSpecialists,
  orgEnrollments,
} from "../db/schema/bookingEngine";
import { platformUsers, userPasswordCredentials } from "../db/schema/schema";

const REQUIRED_DATABASE = "bersoncarebot_test";
const PACKET_PATH_ENV = "SAAS_TEST_FIXTURE_ENV_FILE";

export const SAAS_TEST_FIXTURE_IDS = Object.freeze({
  organizationA: "53000000-0000-4000-8000-0000000000a1",
  organizationB: "53000000-0000-4000-8000-0000000000b1",
  ownerA: "53000000-0000-4000-8000-00000000d0a1",
  ownerB: "53000000-0000-4000-8000-00000000d0b1",
  specialistA: "53000000-0000-4000-8000-00000000e0a1",
  specialistB: "53000000-0000-4000-8000-00000000e0b1",
  membershipA: "53000000-0000-4000-8000-00000000f0a1",
  membershipB: "53000000-0000-4000-8000-00000000f0b1",
  patientsA: Object.freeze([
    "53000000-0000-4000-8000-00000000a101",
    "53000000-0000-4000-8000-00000000a102",
    "53000000-0000-4000-8000-00000000a103",
    "53000000-0000-4000-8000-00000000a104",
    "53000000-0000-4000-8000-00000000a105",
  ]),
  enrollmentsA: Object.freeze([
    "53000000-0000-4000-8000-00000000b101",
    "53000000-0000-4000-8000-00000000b102",
    "53000000-0000-4000-8000-00000000b103",
    "53000000-0000-4000-8000-00000000b104",
    "53000000-0000-4000-8000-00000000b105",
  ]),
  appointmentsA: Object.freeze([
    "53000000-0000-4000-8000-00000000c101",
    "53000000-0000-4000-8000-00000000c102",
    "53000000-0000-4000-8000-00000000c103",
    "53000000-0000-4000-8000-00000000c104",
    "53000000-0000-4000-8000-00000000c105",
    "53000000-0000-4000-8000-00000000c201",
    "53000000-0000-4000-8000-00000000c202",
    "53000000-0000-4000-8000-00000000c203",
    "53000000-0000-4000-8000-00000000c204",
    "53000000-0000-4000-8000-00000000c205",
  ]),
});

type FixtureOwnerCredentials = Readonly<{ emailNormalized: string; password: string }>;
type FixtureDb = NodePgDatabase<typeof schema>;

export type SaasTestFixtureConfig = Readonly<{
  ownerA: FixtureOwnerCredentials;
  ownerB: FixtureOwnerCredentials;
}>;

function requireSecret(packet: Readonly<Record<string, string>>, key: string): string {
  const value = packet[key]?.trim() ?? "";
  if (!value) throw new Error(`missing_required_secret:${key}`);
  return value;
}

function normalizeEmail(value: string, key: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`invalid_email:${key}`);
  }
  if (!normalized.endsWith(".test")) {
    throw new Error(`fixture_email_must_use_reserved_test_domain:${key}`);
  }
  return normalized;
}

export function readSaasTestFixtureConfig(
  packet: Readonly<Record<string, string>>,
): SaasTestFixtureConfig {
  const ownerA = {
    emailNormalized: normalizeEmail(
      requireSecret(packet, "SAAS_TEST_FIXTURE_CLINIC_A_EMAIL"),
      "SAAS_TEST_FIXTURE_CLINIC_A_EMAIL",
    ),
    password: requireSecret(packet, "SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD"),
  };
  const ownerB = {
    emailNormalized: normalizeEmail(
      requireSecret(packet, "SAAS_TEST_FIXTURE_CLINIC_B_EMAIL"),
      "SAAS_TEST_FIXTURE_CLINIC_B_EMAIL",
    ),
    password: requireSecret(packet, "SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD"),
  };

  for (const [label, owner] of [["clinic_a", ownerA], ["clinic_b", ownerB]] as const) {
    if (owner.password.length < 8 || owner.password.length > 128) {
      throw new Error(`invalid_password_length:${label}`);
    }
  }
  if (ownerA.emailNormalized === ownerB.emailNormalized) {
    throw new Error("fixture_owner_emails_must_differ");
  }

  return { ownerA, ownerB };
}

export function resolveFixtureAppointmentTimes(now: Date): Readonly<{
  pastStartAt: string;
  pastEndAt: string;
  futureStartAt: string;
  futureEndAt: string;
}> {
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_clock");
  const dayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  return {
    pastStartAt: new Date(dayStartMs - 7 * dayMs + 9 * hourMs).toISOString(),
    pastEndAt: new Date(dayStartMs - 7 * dayMs + 10 * hourMs).toISOString(),
    futureStartAt: new Date(dayStartMs + 7 * dayMs + 9 * hourMs).toISOString(),
    futureEndAt: new Date(dayStartMs + 7 * dayMs + 10 * hourMs).toISOString(),
  };
}

export function buildSaasTestFixturePlan(now: Date) {
  const times = resolveFixtureAppointmentTimes(now);
  const patients = SAAS_TEST_FIXTURE_IDS.patientsA.map((id, index) => ({
    id,
    displayName: `Synthetic Patient A${index + 1}`,
    firstName: "Synthetic",
    lastName: `Patient A${index + 1}`,
  }));
  const enrollments = patients.map((patient, index) => ({
    id: SAAS_TEST_FIXTURE_IDS.enrollmentsA[index]!,
    organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
    platformUserId: patient.id,
    status: "active" as const,
  }));
  const appointments = patients.flatMap((patient, index) => [
    {
      id: SAAS_TEST_FIXTURE_IDS.appointmentsA[index]!,
      organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
      specialistId: SAAS_TEST_FIXTURE_IDS.specialistA,
      platformUserId: patient.id,
      startAt: new Date(Date.parse(times.pastStartAt) + index * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.parse(times.pastEndAt) + index * 60 * 60 * 1000).toISOString(),
      durationMinutes: 60,
      source: "admin_manual" as const,
      status: "completed" as const,
      attributionJson: { fixture: "saas_s3_test", period: "past" },
    },
    {
      id: SAAS_TEST_FIXTURE_IDS.appointmentsA[index + 5]!,
      organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
      specialistId: SAAS_TEST_FIXTURE_IDS.specialistA,
      platformUserId: patient.id,
      startAt: new Date(Date.parse(times.futureStartAt) + index * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.parse(times.futureEndAt) + index * 60 * 60 * 1000).toISOString(),
      durationMinutes: 60,
      source: "admin_manual" as const,
      status: "confirmed" as const,
      attributionJson: { fixture: "saas_s3_test", period: "future" },
    },
  ]);
  return Object.freeze({
    clinics: Object.freeze([
      Object.freeze({
        key: "A" as const,
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
        ownerId: SAAS_TEST_FIXTURE_IDS.ownerA,
        specialistId: SAAS_TEST_FIXTURE_IDS.specialistA,
        membershipId: SAAS_TEST_FIXTURE_IDS.membershipA,
        patientCount: 5,
      }),
      Object.freeze({
        key: "B" as const,
        organizationId: SAAS_TEST_FIXTURE_IDS.organizationB,
        ownerId: SAAS_TEST_FIXTURE_IDS.ownerB,
        specialistId: SAAS_TEST_FIXTURE_IDS.specialistB,
        membershipId: SAAS_TEST_FIXTURE_IDS.membershipB,
        patientCount: 0,
      }),
    ]),
    patients: Object.freeze(patients),
    enrollments: Object.freeze(enrollments),
    appointments: Object.freeze(appointments),
  });
}

async function assertExactTestDatabase(db: FixtureDb): Promise<void> {
  const result = await db.execute<{ database_name: string }>(
    sql`SELECT current_database()::text AS database_name`,
  );
  const databaseName = result.rows[0]?.database_name ?? "";
  if (databaseName !== REQUIRED_DATABASE) {
    throw new Error(`refusing_database_target:expected_${REQUIRED_DATABASE}`);
  }
}

async function hashIfChanged(existingHash: string | null, password: string): Promise<string> {
  if (existingHash) {
    try {
      if (await argon2.verify(existingHash, password)) return existingHash;
    } catch {
      // Reconcile an invalid/legacy hash below.
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
  const ownerConfigs = [
    {
      id: SAAS_TEST_FIXTURE_IDS.ownerA,
      organizationId: SAAS_TEST_FIXTURE_IDS.organizationA,
      specialistId: SAAS_TEST_FIXTURE_IDS.specialistA,
      membershipId: SAAS_TEST_FIXTURE_IDS.membershipA,
      organizationTitle: "SaaS TEST Clinic A",
      displayName: "Synthetic Clinic A Owner",
      credentials: config.ownerA,
    },
    {
      id: SAAS_TEST_FIXTURE_IDS.ownerB,
      organizationId: SAAS_TEST_FIXTURE_IDS.organizationB,
      specialistId: SAAS_TEST_FIXTURE_IDS.specialistB,
      membershipId: SAAS_TEST_FIXTURE_IDS.membershipB,
      organizationTitle: "SaaS TEST Clinic B",
      displayName: "Synthetic Clinic B Owner",
      credentials: config.ownerB,
    },
  ] as const;

  await db.transaction(async (tx) => {
    for (const owner of ownerConfigs) {
      const emailCollision = await tx
        .select({ id: platformUsers.id })
        .from(platformUsers)
        .where(
          and(
            eq(platformUsers.emailNormalized, owner.credentials.emailNormalized),
            notInArray(platformUsers.id, [owner.id]),
          ),
        )
        .limit(1);
      if (emailCollision[0]) throw new Error("fixture_owner_email_collision");

      await tx
        .insert(beOrganizations)
        .values({
          id: owner.organizationId,
          title: owner.organizationTitle,
          isActive: true,
          sortOrder: 0,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: beOrganizations.id,
          set: { title: owner.organizationTitle, isActive: true, sortOrder: 0, updatedAt: nowIso },
        });

      await tx
        .insert(platformUsers)
        .values({
          id: owner.id,
          phoneNormalized: null,
          displayName: owner.displayName,
          role: "doctor",
          email: owner.credentials.emailNormalized,
          emailNormalized: owner.credentials.emailNormalized,
          emailVerifiedAt: nowIso,
          isBlocked: false,
          blockedAt: null,
          blockedReason: null,
          isArchived: false,
          mergedIntoId: null,
          mergedAt: null,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: platformUsers.id,
          set: {
            phoneNormalized: null,
            displayName: owner.displayName,
            role: "doctor",
            email: owner.credentials.emailNormalized,
            emailNormalized: owner.credentials.emailNormalized,
            emailVerifiedAt: nowIso,
            isBlocked: false,
            blockedAt: null,
            blockedReason: null,
            isArchived: false,
            mergedIntoId: null,
            mergedAt: null,
            updatedAt: nowIso,
          },
        });

      const credentialRows = await tx
        .select({ passwordHash: userPasswordCredentials.passwordHash })
        .from(userPasswordCredentials)
        .where(eq(userPasswordCredentials.userId, owner.id))
        .limit(1);
      const passwordHash = await hashIfChanged(
        credentialRows[0]?.passwordHash ?? null,
        owner.credentials.password,
      );
      await tx
        .insert(userPasswordCredentials)
        .values({ userId: owner.id, passwordHash, algo: "argon2id", updatedAt: nowIso })
        .onConflictDoUpdate({
          target: userPasswordCredentials.userId,
          set: { passwordHash, algo: "argon2id", updatedAt: nowIso },
        });

      await tx
        .insert(beSpecialists)
        .values({
          id: owner.specialistId,
          organizationId: owner.organizationId,
          fullName: owner.displayName,
          description: "Synthetic TEST fixture",
          isActive: true,
          sortOrder: 0,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: beSpecialists.id,
          set: {
            organizationId: owner.organizationId,
            fullName: owner.displayName,
            description: "Synthetic TEST fixture",
            isActive: true,
            sortOrder: 0,
            updatedAt: nowIso,
          },
        });

      await tx
        .insert(beOrganizationMembers)
        .values({
          id: owner.membershipId,
          organizationId: owner.organizationId,
          platformUserId: owner.id,
          role: "owner",
          specialistId: owner.specialistId,
          status: "active",
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: beOrganizationMembers.id,
          set: {
            organizationId: owner.organizationId,
            platformUserId: owner.id,
            role: "owner",
            specialistId: owner.specialistId,
            status: "active",
            updatedAt: nowIso,
          },
        });
    }

    for (const patient of plan.patients) {
      await tx
        .insert(platformUsers)
        .values({
          id: patient.id,
          phoneNormalized: null,
          displayName: patient.displayName,
          role: "client",
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: null,
          emailNormalized: null,
          emailVerifiedAt: null,
          isBlocked: false,
          isArchived: false,
          mergedIntoId: null,
          mergedAt: null,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: platformUsers.id,
          set: {
            phoneNormalized: null,
            displayName: patient.displayName,
            role: "client",
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: null,
            emailNormalized: null,
            emailVerifiedAt: null,
            isBlocked: false,
            isArchived: false,
            mergedIntoId: null,
            mergedAt: null,
            updatedAt: nowIso,
          },
        });
    }

    await tx.delete(beAppointments).where(
      inArray(beAppointments.organizationId, [
        SAAS_TEST_FIXTURE_IDS.organizationA,
        SAAS_TEST_FIXTURE_IDS.organizationB,
      ]),
    );
    await tx.delete(orgEnrollments).where(
      inArray(orgEnrollments.organizationId, [
        SAAS_TEST_FIXTURE_IDS.organizationA,
        SAAS_TEST_FIXTURE_IDS.organizationB,
      ]),
    );

    await tx.insert(orgEnrollments).values([...plan.enrollments]);
    await tx.insert(beAppointments).values([...plan.appointments]);

    const activeOrganizations = await tx
      .select({ value: count() })
      .from(beOrganizations)
      .where(
        and(
          inArray(beOrganizations.id, [
            SAAS_TEST_FIXTURE_IDS.organizationA,
            SAAS_TEST_FIXTURE_IDS.organizationB,
          ]),
          eq(beOrganizations.isActive, true),
        ),
      );
    assertCount("active_organizations", activeOrganizations[0]?.value ?? 0, 2);

    const activeOwners = await tx
      .select({ value: count() })
      .from(beOrganizationMembers)
      .where(
        and(
          inArray(beOrganizationMembers.id, [
            SAAS_TEST_FIXTURE_IDS.membershipA,
            SAAS_TEST_FIXTURE_IDS.membershipB,
          ]),
          eq(beOrganizationMembers.role, "owner"),
          eq(beOrganizationMembers.status, "active"),
        ),
      );
    assertCount("active_owner_memberships", activeOwners[0]?.value ?? 0, 2);

    const activeSpecialists = await tx
      .select({ value: count() })
      .from(beSpecialists)
      .where(
        and(
          inArray(beSpecialists.id, [
            SAAS_TEST_FIXTURE_IDS.specialistA,
            SAAS_TEST_FIXTURE_IDS.specialistB,
          ]),
          eq(beSpecialists.isActive, true),
        ),
      );
    assertCount("active_specialists", activeSpecialists[0]?.value ?? 0, 2);

    const clinicAEnrollments = await tx
      .select({ value: count() })
      .from(orgEnrollments)
      .where(
        and(
          eq(orgEnrollments.organizationId, SAAS_TEST_FIXTURE_IDS.organizationA),
          eq(orgEnrollments.status, "active"),
        ),
      );
    assertCount("clinic_a_patients", clinicAEnrollments[0]?.value ?? 0, 5);

    const clinicBEnrollments = await tx
      .select({ value: count() })
      .from(orgEnrollments)
      .where(eq(orgEnrollments.organizationId, SAAS_TEST_FIXTURE_IDS.organizationB));
    assertCount("clinic_b_patients", clinicBEnrollments[0]?.value ?? 0, 0);

    const clinicAPastAppointments = await tx
      .select({ value: count() })
      .from(beAppointments)
      .where(
        and(
          eq(beAppointments.organizationId, SAAS_TEST_FIXTURE_IDS.organizationA),
          eq(beAppointments.status, "completed"),
        ),
      );
    assertCount("clinic_a_past_appointments", clinicAPastAppointments[0]?.value ?? 0, 5);

    const clinicAFutureAppointments = await tx
      .select({ value: count() })
      .from(beAppointments)
      .where(
        and(
          eq(beAppointments.organizationId, SAAS_TEST_FIXTURE_IDS.organizationA),
          eq(beAppointments.status, "confirmed"),
        ),
      );
    assertCount("clinic_a_future_appointments", clinicAFutureAppointments[0]?.value ?? 0, 5);

    const clinicBAppointments = await tx
      .select({ value: count() })
      .from(beAppointments)
      .where(eq(beAppointments.organizationId, SAAS_TEST_FIXTURE_IDS.organizationB));
    assertCount("clinic_b_appointments", clinicBAppointments[0]?.value ?? 0, 0);
  });
}

export async function runSaasTestFixtureSeeder(env: NodeJS.ProcessEnv): Promise<void> {
  const packetPath = env[PACKET_PATH_ENV]?.trim() ?? "";
  if (!packetPath) throw new Error("fixture_packet_path_required");
  const packet = readSaasTestFixturePacket({
    filePath: packetPath,
    expectedGroupId: resolveDeployGroupId(),
  });
  const config = readSaasTestFixtureConfig(packet);
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) throw new Error("fixture_database_url_required");
  const pgOptions = env.PGOPTIONS?.trim();
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(pgOptions ? { options: pgOptions } : {}),
  });
  const db = drizzle(pool, { schema });
  try {
    await assertExactTestDatabase(db);
    await reconcileFixtures(db, config);
  } finally {
    await pool.end();
  }
  console.log(
    "[saas-test-fixture] OK: 2 active owner clinics, Clinic A has 5 synthetic patients with past/future appointments, Clinic B is empty",
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
  } catch {
    writeError("[saas-test-fixture] FAILED\n");
    return 1;
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(await runSaasTestFixtureCli({ env: process.env }));
}
