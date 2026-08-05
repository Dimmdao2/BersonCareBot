import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { getDrizzleOrMutationTx as getDrizzle } from '@/infra/db/drizzleMutationTx';
import { runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import { resolveOrCreateDoctorClientByPhoneInTransaction } from '@/infra/repos/pgDoctorClientCreate';
import { ensureInvitedOrganizationClientRelationship } from '@/infra/repos/pgPatientOrganizationEnrollment';
import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
import {
  assertManualPatientCommandReplay,
  findManualPatientCommand,
  insertManualPatientCommand,
  isManualPatientCommandUniqueViolation,
  lockManualPatientCommand,
  manualPatientCommandFingerprint,
} from '@/infra/repos/pgManualPatientCommand';
import { BE_DEFAULT_ORGANIZATION_ID } from '../../../db/schema/bookingEngine';
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  beBranches,
  beClinicServices,
  beExternalEntityMappings,
  beOrganizations,
  orgEnrollments,
  bePatientTimelineEvents,
  beRooms,
  beServiceLocationAvailability,
  beSpecialistLocations,
  beSpecialistRooms,
  beSpecialistServiceAvailability,
  beSpecialists,
} from '../../../db/schema/bookingEngine';
import { clinicalVisit } from '../../../db/schema/patientClinical';
import { platformUsers } from '../../../db/schema/schema';
import { pickPreferredSsaId } from '@/modules/booking-scheduling/ssaResolve';
import { isChainFree } from '@/modules/booking-scheduling/computeSlots';
import { listBookingBusyIntervals } from '@/infra/repos/pgBookingScheduling';
import type { BookingEngineCorePort } from '@/modules/booking-engine/ports';
import {
  normalizeAppointmentReminderSettings,
} from '@/modules/booking-notifications/appointmentReminderPresets';
import type {
  AppointmentStatus,
  BeAppointment,
  BeBranch,
  BeClinicService,
  BeOrganization,
  BeRoom,
  BeServiceLocationAvailability,
  BeSpecialist,
  BeSpecialistServiceAvailability,
  CreateAppointmentInput,
  CreateManualPatientVisitInput,
  CreateManualPatientVisitResult,
  TransitionAppointmentStatusInput,
} from '@/modules/booking-engine/types';

function mapOrg(row: typeof beOrganizations.$inferSelect): BeOrganization {
  return {
    id: row.id,
    title: row.title,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function mapBranch(row: typeof beBranches.$inferSelect): BeBranch {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    shortTitle: row.shortTitle ?? null,
    color: row.color ?? null,
    cityCode: row.cityCode,
    address: row.address ?? null,
    timezone: row.timezone,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function mapRoom(row: typeof beRooms.$inferSelect): BeRoom {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    title: row.title,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function mapSpecialist(row: typeof beSpecialists.$inferSelect): BeSpecialist {
  const reminderSettings = normalizeAppointmentReminderSettings({
    allowedPresetIds: row.appointmentReminderAllowedPresetIds ?? [],
    defaultPresetId: row.appointmentReminderDefaultPresetId ?? null,
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    fullName: row.fullName,
    description: row.description ?? null,
    appointmentReminderAllowedPresetIds: reminderSettings.allowedPresetIds,
    appointmentReminderDefaultPresetId: reminderSettings.defaultPresetId,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function mapService(row: typeof beClinicServices.$inferSelect): BeClinicService {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? null,
    durationMinutes: row.durationMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    priceMinor: row.priceMinor,
    isActive: row.isActive,
    prepaymentApplicable: row.prepaymentApplicable,
    usableInPackages: row.usableInPackages,
    onlinePaymentApplicable: row.onlinePaymentApplicable,
    publicWidgetVisible: row.publicWidgetVisible,
    adminManualOnly: row.adminManualOnly,
    sortOrder: row.sortOrder,
  };
}

function mapAppointment(row: typeof beAppointments.$inferSelect): BeAppointment {
  const reminderSettings = normalizeAppointmentReminderSettings({
    allowedPresetIds: row.appointmentReminderAllowedPresetIds ?? [],
    defaultPresetId: row.appointmentReminderPresetId ?? null,
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId ?? null,
    roomId: row.roomId ?? null,
    specialistId: row.specialistId ?? null,
    serviceId: row.serviceId ?? null,
    platformUserId: row.platformUserId ?? null,
    startAt: row.startAt,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    chainId: row.chainId ?? null,
    chainPosition: row.chainPosition ?? null,
    source: row.source as BeAppointment['source'],
    status: row.status as BeAppointment['status'],
    originalStartAt: row.originalStartAt ?? null,
    rescheduleCount: row.rescheduleCount,
    paymentRef: row.paymentRef ?? null,
    packageUsageRef: row.packageUsageRef ?? null,
    phoneNormalized: row.phoneNormalized ?? null,
    attributionJson: (row.attributionJson ?? {}) as Record<string, unknown>,
    appointmentReminderAllowedPresetIds: reminderSettings.allowedPresetIds,
    appointmentReminderPresetId: reminderSettings.defaultPresetId,
    appointmentReminderSelectionSource:
      row.appointmentReminderSelectionSource === 'patient' ? 'patient' : 'specialist_default',
  };
}

async function insertAppointmentInTransaction(
  tx: DrizzleDb,
  input: CreateAppointmentInput,
  now: string,
  catalogValidated = false,
): Promise<BeAppointment> {
  if (input.source === 'admin_manual' && !catalogValidated) {
    await assertManualAppointmentCatalogSelection(tx, input);
  }
  const status = input.status ?? 'created';
  const inserted = await tx
    .insert(beAppointments)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      branchId: input.branchId ?? null,
      roomId: input.roomId ?? null,
      specialistId: input.specialistId ?? null,
      serviceId: input.serviceId ?? null,
      platformUserId: input.platformUserId ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      durationMinutes: input.durationMinutes,
      chainId: input.chainId ?? null,
      chainPosition: input.chainPosition ?? null,
      source: input.source,
      status,
      originalStartAt: input.startAt,
      rescheduleCount: 0,
      phoneNormalized: input.phoneNormalized ?? null,
      attributionJson: input.attributionJson ?? {},
      appointmentReminderAllowedPresetIds: input.appointmentReminderAllowedPresetIds ?? [],
      appointmentReminderPresetId: input.appointmentReminderPresetId ?? null,
      appointmentReminderSelectionSource: input.appointmentReminderSelectionSource ?? 'specialist_default',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const appointment = mapAppointment(inserted[0]!);
  await tx.insert(beAppointmentEvents).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    eventType: 'created',
    actorId: input.actorId ?? null,
    payload: { status },
  });
  await tx.insert(beAppointmentHistoryEvents).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    eventType: 'created',
    actorId: input.actorId ?? null,
    payload: { status },
    occurredAt: now,
  });
  if (appointment.platformUserId) {
    await tx.insert(bePatientTimelineEvents).values({
      organizationId: appointment.organizationId,
      platformUserId: appointment.platformUserId,
      domain: 'appointment',
      eventType: 'appointment_created',
      linkedObjectType: 'appointment',
      linkedObjectId: appointment.id,
      payload: { status },
      occurredAt: now,
    });
  }
  return appointment;
}

const ONLINE_LOCK_BUCKET_MS = 60_000;
const MAX_ONLINE_LOCK_BUCKETS = 8 * 60;

function onlineAppointmentLockKeys(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const startMs = new Date(rangeStart).getTime();
  const endMs = new Date(rangeEnd).getTime();
  const bucketCount = (endMs - startMs) / ONLINE_LOCK_BUCKET_MS;
  if (
    !Number.isInteger(bucketCount) ||
    bucketCount < 1 ||
    bucketCount > MAX_ONLINE_LOCK_BUCKETS ||
    startMs % ONLINE_LOCK_BUCKET_MS !== 0 ||
    endMs % ONLINE_LOCK_BUCKET_MS !== 0
  ) {
    throw new Error('invalid_online_appointment_lock_range');
  }
  return Array.from(
    { length: bucketCount },
    (_, index) =>
      `booking:online-minute:${organizationId}:${new Date(startMs + index * ONLINE_LOCK_BUCKET_MS).toISOString()}`,
  );
}

async function lockOnlineAppointmentRange(
  tx: DrizzleDb,
  organizationId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<void> {
  const lockKeys = onlineAppointmentLockKeys(organizationId, rangeStart, rangeEnd);
  const lockKeyParameters = sql.join(
    lockKeys.map((lockKey) => sql`${lockKey}`),
    sql`, `,
  );
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
    FROM unnest(ARRAY[${lockKeyParameters}]::text[]) AS requested_locks(lock_key)
    ORDER BY lock_key
  `);
}

async function insertOnlineAppointmentsIfAvailableInTransaction(
  tx: DrizzleDb,
  inputs: readonly CreateAppointmentInput[],
  now: string,
): Promise<BeAppointment[]> {
  const first = inputs[0];
  const last = inputs.at(-1);
  if (!first || !last) throw new Error('appointment_chain_required');
  const organizationId = first.organizationId;
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
  await lockOnlineAppointmentRange(tx, organizationId, first.startAt, last.endAt);
  const busy = await listBookingBusyIntervals(tx, {
    organizationId,
    specialistId: null,
    roomId: null,
    rangeStart: first.startAt,
    rangeEnd: last.endAt,
  });
  if (inputs.some((input) => !isChainFree(input.startAt, 1, input.durationMinutes, busy))) {
    throw new Error('slot_overlap');
  }
  const appointments: BeAppointment[] = [];
  for (const input of inputs)
    appointments.push(await insertAppointmentInTransaction(tx, input, now));
  return appointments;
}

async function assertManualSpecialistSelection(
  tx: DrizzleDb,
  organizationId: string,
  specialistId: string,
): Promise<void> {
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
  const [specialist] = await tx
    .select({ id: beSpecialists.id })
    .from(beSpecialists)
    .where(
      and(
        eq(beSpecialists.id, specialistId),
        eq(beSpecialists.organizationId, organizationId),
        eq(beSpecialists.isActive, true),
      ),
    )
    .limit(1);
  if (!specialist) throw new Error('specialist_not_found');
}

async function assertManualAppointmentCatalogSelection(
  tx: DrizzleDb,
  input: CreateAppointmentInput,
): Promise<void> {
  if (!input.specialistId) throw new Error('specialist_required');
  await assertManualSpecialistSelection(tx, input.organizationId, input.specialistId);

  if (input.branchId) {
    const [branch] = await tx
      .select({ id: beBranches.id })
      .from(beBranches)
      .where(
        and(
          eq(beBranches.id, input.branchId),
          eq(beBranches.organizationId, input.organizationId),
          eq(beBranches.isActive, true),
        ),
      )
      .limit(1);
    if (!branch) throw new Error('branch_not_found');
  }

  if (input.roomId) {
    if (!input.branchId) throw new Error('room_branch_mismatch');
    const [room] = await tx
      .select({ id: beRooms.id })
      .from(beRooms)
      .where(
        and(
          eq(beRooms.id, input.roomId),
          eq(beRooms.organizationId, input.organizationId),
          eq(beRooms.branchId, input.branchId),
          eq(beRooms.isActive, true),
        ),
      )
      .limit(1);
    if (!room) throw new Error('room_not_found');
  }

  if (!input.serviceId) return;
  const [service] = await tx
    .select({ id: beClinicServices.id })
    .from(beClinicServices)
    .where(
      and(
        eq(beClinicServices.id, input.serviceId),
        eq(beClinicServices.organizationId, input.organizationId),
        eq(beClinicServices.isActive, true),
      ),
    )
    .limit(1);
  if (!service) throw new Error('service_not_found');

  const availabilityConditions = [
    eq(beSpecialistServiceAvailability.organizationId, input.organizationId),
    eq(beSpecialistServiceAvailability.specialistId, input.specialistId),
    eq(beSpecialistServiceAvailability.serviceId, input.serviceId),
    eq(beSpecialistServiceAvailability.isActive, true),
    input.branchId
      ? eq(beSpecialistServiceAvailability.branchId, input.branchId)
      : isNull(beSpecialistServiceAvailability.branchId),
  ];
  if (input.roomId) {
    availabilityConditions.push(
      or(
        isNull(beSpecialistServiceAvailability.roomId),
        eq(beSpecialistServiceAvailability.roomId, input.roomId),
      )!,
    );
  }
  const [availability] = await tx
    .select({ id: beSpecialistServiceAvailability.id })
    .from(beSpecialistServiceAvailability)
    .where(and(...availabilityConditions))
    .limit(1);
  if (!availability) throw new Error('service_not_available_for_specialist');
}

function scheduledManualPatientCommandFingerprint(
  input: Extract<CreateManualPatientVisitInput, { kind: 'scheduled' }>,
): string {
  const identity = {
    lastName: input.lastName,
    firstName: input.firstName,
    patronymic: input.patronymic,
    phoneNormalized: input.phoneNormalized,
    emailNormalized: input.emailNormalized,
  };
  const semantic = { kind: input.kind, identity, appointment: input.appointment };
  return manualPatientCommandFingerprint(semantic);
}

function walkInManualPatientCommandFingerprint(
  input: Extract<CreateManualPatientVisitInput, { kind: 'walk_in' }>,
): string {
  return manualPatientCommandFingerprint({
    kind: input.kind,
    identity: {
      lastName: input.lastName,
      firstName: input.firstName,
      patronymic: input.patronymic,
      phoneNormalized: input.phoneNormalized,
      emailNormalized: input.emailNormalized,
    },
    walkIn: input.walkIn,
  });
}

async function loadManualPatientForReplay(
  tx: DrizzleDb,
  organizationId: string,
  userId: string,
): Promise<Pick<CreateManualPatientVisitResult, 'patient' | 'portalStatus'>> {
  const [patient] = await tx
    .select({
      userId: platformUsers.id,
      displayName: platformUsers.displayName,
      lastName: platformUsers.lastName,
      firstName: platformUsers.firstName,
      patronymic: platformUsers.patronymic,
      phoneNormalized: platformUsers.phoneNormalized,
    })
    .from(platformUsers)
    .where(and(eq(platformUsers.id, userId), isNull(platformUsers.mergedIntoId)))
    .limit(1);
  const [relationship] = await tx
    .select({ portalActivatedAt: orgEnrollments.portalActivatedAt })
    .from(orgEnrollments)
    .where(
      and(
        eq(orgEnrollments.organizationId, organizationId),
        eq(orgEnrollments.platformUserId, userId),
      ),
    )
    .limit(1);
  if (!patient || !relationship) throw new Error('idempotency_replay_missing');
  return {
    patient: { ...patient, created: false },
    portalStatus: relationship.portalActivatedAt ? 'linked' : 'not_activated',
  };
}

async function lockManualPatientRelationship(
  tx: DrizzleDb,
  organizationId: string,
  userId: string,
): Promise<string> {
  const [relationship] = await tx
    .select({ status: orgEnrollments.status })
    .from(orgEnrollments)
    .where(
      and(
        eq(orgEnrollments.organizationId, organizationId),
        eq(orgEnrollments.platformUserId, userId),
      ),
    )
    .for('update');
  if (!relationship) throw new Error('patient_not_available');
  return relationship.status;
}

function isCommandPrimaryKeyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: unknown; constraint?: unknown };
  return (
    value.code === '23505' &&
    (value.constraint === 'be_appointments_pkey' || value.constraint === 'clinical_visit_pkey')
  );
}

export function createPgBookingEnginePort(): BookingEngineCorePort {
  return {
    async getDefaultOrganizationId() {
      return getConfigValue('booking_default_organization_id');
    },

    async getOrganization(id) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beOrganizations)
        .where(eq(beOrganizations.id, id))
        .limit(1);
      return rows[0] ? mapOrg(rows[0]) : null;
    },

    async listOrganizations() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beOrganizations)
        .orderBy(asc(beOrganizations.sortOrder), asc(beOrganizations.title));
      return rows.map(mapOrg);
    },

    async upsertOrganization(input) {
      const db = getDrizzle();
      const id = input.id ?? BE_DEFAULT_ORGANIZATION_ID;
      const now = new Date().toISOString();
      const updated = await db
        .update(beOrganizations)
        .set({
          title: input.title,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          updatedAt: now,
        })
        .where(eq(beOrganizations.id, id))
        .returning();
      if (updated.length === 0) throw new Error('organization_not_found');
      const row = await this.getOrganization(id);
      if (!row) throw new Error('organization_not_found');
      return row;
    },

    async listBranches(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beBranches)
        .where(eq(beBranches.organizationId, organizationId))
        .orderBy(asc(beBranches.sortOrder), asc(beBranches.title));
      return rows.map(mapBranch);
    },

    async getBranch(id) {
      const db = getDrizzle();
      const rows = await db.select().from(beBranches).where(eq(beBranches.id, id)).limit(1);
      return rows[0] ? mapBranch(rows[0]) : null;
    },

    async upsertBranch(input) {
      const now = new Date().toISOString();
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          const [existing] = await tx
            .select({
              organizationId: beBranches.organizationId,
              isActive: beBranches.isActive,
            })
            .from(beBranches)
            .where(eq(beBranches.id, id))
            .limit(1);
          if (!existing) return null;

          const nextIsActive = input.isActive ?? existing.isActive;
          const reactivating = existing.isActive === false && nextIsActive === true;
          if (reactivating) {
            await transactionQuotaPort.withinLock(
              tx,
              { organizationId: existing.organizationId, mechanic: 'branches' },
              (quota) =>
                quota.assertStockAvailable(async () => {
                  const usage = await runWebappPgText<{ used_value: number }>(
                    `SELECT count(*)::int AS used_value
                     FROM be_branches
                     WHERE organization_id = $1
                       AND is_active = true`,
                    [existing.organizationId],
                    tx,
                  );
                  return usage.rows[0]?.used_value ?? 0;
                }),
            );
          }

          const patch: Partial<typeof beBranches.$inferInsert> = {
            title: input.title,
            cityCode: input.cityCode,
            address: input.address ?? null,
            timezone: input.timezone ?? 'Europe/Moscow',
            isActive: nextIsActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          };
          // Only write shortTitle when explicitly provided (preserve existing value otherwise)
          if ('shortTitle' in input) {
            patch.shortTitle = (input as { shortTitle?: string | null }).shortTitle ?? null;
          }
          if ('color' in input) {
            patch.color = (input as { color?: string | null }).color ?? null;
          }
          await tx.update(beBranches).set(patch).where(eq(beBranches.id, id));
          const rows = await tx.select().from(beBranches).where(eq(beBranches.id, id)).limit(1);
          return rows[0] ? mapBranch(rows[0]) : null;
        });
        if (!row) throw new Error('branch_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beBranches)
          .values({
            organizationId: input.organizationId,
            title: input.title,
            shortTitle: (input as { shortTitle?: string | null }).shortTitle ?? null,
            color: (input as { color?: string | null }).color ?? null,
            cityCode: input.cityCode,
            address: input.address ?? null,
            timezone: input.timezone ?? 'Europe/Moscow',
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapBranch(inserted[0]!);
    },

    async createPhysicalBranchWithDefaultColor(input) {
      return runWebappTransaction(async (tx) => {
        // §5a stage 5.3: atomic branches quota, checked before the palette lock/count below —
        // deactivating a branch (isActive=false) frees its slot, so only active branches count.
        await transactionQuotaPort.withinLock(
          tx,
          { organizationId: input.organizationId, mechanic: 'branches' },
          (quota) =>
            quota.assertStockAvailable(async () => {
              const usage = await runWebappPgText<{ used_value: number }>(
                `SELECT count(*)::int AS used_value
                 FROM be_branches
                 WHERE organization_id = $1
                   AND is_active = true`,
                [input.organizationId],
                tx,
              );
              return usage.rows[0]?.used_value ?? 0;
            }),
        );
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`booking-location-palette:${input.organizationId}`}, 0))`,
        );
        const [row] = await tx
          .select({ value: count() })
          .from(beBranches)
          .where(
            and(
              eq(beBranches.organizationId, input.organizationId),
              ne(sql`lower(${beBranches.cityCode})`, 'online'),
              ne(sql`lower(${beBranches.title})`, 'онлайн'),
            ),
          );
        const physicalCount = row?.value ?? 0;
        const color = input.physicalPalette[physicalCount % input.physicalPalette.length];
        if (!color) throw new Error('booking_location_palette_empty');
        const now = new Date().toISOString();
        const [inserted] = await tx
          .insert(beBranches)
          .values({
            organizationId: input.organizationId,
            title: input.title,
            shortTitle: input.shortTitle ?? null,
            color,
            cityCode: input.cityCode,
            address: input.address ?? null,
            timezone: input.timezone ?? 'Europe/Moscow',
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!inserted) throw new Error('branch_create_failed');
        return mapBranch(inserted);
      });
    },

    async deactivateBranch(id) {
      const res = await runWebappTransaction((tx) =>
        tx
          .update(beBranches)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(beBranches.id, id)),
      );
      return (res.rowCount ?? 0) > 0;
    },

    async listRooms(organizationId, branchId) {
      const db = getDrizzle();
      const cond = branchId
        ? and(eq(beRooms.organizationId, organizationId), eq(beRooms.branchId, branchId))
        : eq(beRooms.organizationId, organizationId);
      const rows = await db
        .select()
        .from(beRooms)
        .where(cond)
        .orderBy(asc(beRooms.sortOrder), asc(beRooms.title));
      return rows.map(mapRoom);
    },

    async getRoom(id) {
      const db = getDrizzle();
      const rows = await db.select().from(beRooms).where(eq(beRooms.id, id)).limit(1);
      return rows[0] ? mapRoom(rows[0]) : null;
    },

    async upsertRoom(input) {
      const now = new Date().toISOString();
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          await tx
            .update(beRooms)
            .set({
              title: input.title,
              isActive: input.isActive,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(eq(beRooms.id, id));
          const rows = await tx.select().from(beRooms).where(eq(beRooms.id, id)).limit(1);
          return rows[0] ? mapRoom(rows[0]) : null;
        });
        if (!row) throw new Error('room_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beRooms)
          .values({
            organizationId: input.organizationId,
            branchId: input.branchId,
            title: input.title,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapRoom(inserted[0]!);
    },

    async deactivateRoom(id) {
      const res = await runWebappTransaction((tx) =>
        tx
          .update(beRooms)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(beRooms.id, id)),
      );
      return (res.rowCount ?? 0) > 0;
    },

    async listSpecialists(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSpecialists)
        .where(eq(beSpecialists.organizationId, organizationId))
        .orderBy(asc(beSpecialists.sortOrder), asc(beSpecialists.fullName));
      return rows.map(mapSpecialist);
    },

    async getSpecialist(id) {
      const db = getDrizzle();
      const rows = await db.select().from(beSpecialists).where(eq(beSpecialists.id, id)).limit(1);
      return rows[0] ? mapSpecialist(rows[0]) : null;
    },

    async upsertSpecialist(input) {
      const now = new Date().toISOString();
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          await tx
            .update(beSpecialists)
            .set({
              fullName: input.fullName,
              description: input.description ?? null,
              isActive: input.isActive,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(eq(beSpecialists.id, id));
          const rows = await tx
            .select()
            .from(beSpecialists)
            .where(eq(beSpecialists.id, id))
            .limit(1);
          return rows[0] ? mapSpecialist(rows[0]) : null;
        });
        if (!row) throw new Error('specialist_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beSpecialists)
          .values({
            organizationId: input.organizationId,
            fullName: input.fullName,
            description: input.description ?? null,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapSpecialist(inserted[0]!);
    },

    async deactivateSpecialist(id) {
      const res = await runWebappTransaction((tx) =>
        tx
          .update(beSpecialists)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(beSpecialists.id, id)),
      );
      return (res.rowCount ?? 0) > 0;
    },

    async setSpecialistLocation(input) {
      await runWebappTransaction((tx) =>
        tx
          .insert(beSpecialistLocations)
          .values({
            organizationId: input.organizationId,
            specialistId: input.specialistId,
            branchId: input.branchId,
            isActive: input.isActive,
          })
          .onConflictDoUpdate({
            target: [beSpecialistLocations.specialistId, beSpecialistLocations.branchId],
            set: { isActive: input.isActive },
          }),
      );
    },

    async setSpecialistRoom(input) {
      await runWebappTransaction((tx) =>
        tx
          .insert(beSpecialistRooms)
          .values({
            organizationId: input.organizationId,
            specialistId: input.specialistId,
            roomId: input.roomId,
            isActive: input.isActive,
          })
          .onConflictDoUpdate({
            target: [beSpecialistRooms.specialistId, beSpecialistRooms.roomId],
            set: { isActive: input.isActive },
          }),
      );
    },

    async listServices(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beClinicServices)
        .where(eq(beClinicServices.organizationId, organizationId))
        .orderBy(asc(beClinicServices.sortOrder), asc(beClinicServices.title));
      return rows.map(mapService);
    },

    async getService(id) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beClinicServices)
        .where(eq(beClinicServices.id, id))
        .limit(1);
      return rows[0] ? mapService(rows[0]) : null;
    },

    async upsertService(input) {
      const now = new Date().toISOString();
      const values = {
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        priceMinor: input.priceMinor,
        isActive: input.isActive,
        prepaymentApplicable: input.prepaymentApplicable,
        usableInPackages: input.usableInPackages,
        onlinePaymentApplicable: input.onlinePaymentApplicable,
        publicWidgetVisible: input.publicWidgetVisible,
        adminManualOnly: input.adminManualOnly,
        sortOrder: input.sortOrder,
        updatedAt: now,
      };
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          await tx.update(beClinicServices).set(values).where(eq(beClinicServices.id, id));
          const rows = await tx
            .select()
            .from(beClinicServices)
            .where(eq(beClinicServices.id, id))
            .limit(1);
          return rows[0] ? mapService(rows[0]) : null;
        });
        if (!row) throw new Error('service_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beClinicServices)
          .values({ ...values, createdAt: now })
          .returning(),
      );
      return mapService(inserted[0]!);
    },

    async deactivateService(id) {
      const res = await runWebappTransaction((tx) =>
        tx
          .update(beClinicServices)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(beClinicServices.id, id)),
      );
      return (res.rowCount ?? 0) > 0;
    },

    async upsertSpecialistServiceAvailability(input) {
      const now = new Date().toISOString();

      const row = await runWebappTransaction(async (tx) => {
        const scopeConds = [
          eq(beSpecialistServiceAvailability.organizationId, input.organizationId),
          eq(beSpecialistServiceAvailability.specialistId, input.specialistId),
          eq(beSpecialistServiceAvailability.serviceId, input.serviceId),
        ];
        if (input.branchId) {
          scopeConds.push(eq(beSpecialistServiceAvailability.branchId, input.branchId));
        } else {
          scopeConds.push(isNull(beSpecialistServiceAvailability.branchId));
        }

        const existingRows = await tx
          .select()
          .from(beSpecialistServiceAvailability)
          .where(and(...scopeConds, eq(beSpecialistServiceAvailability.isActive, true)));

        const targetId = pickPreferredSsaId(
          existingRows.map((r) => ({
            id: r.id,
            createdAt: r.createdAt,
            isActive: r.isActive,
          })),
        );

        if (targetId) {
          const updated = await tx
            .update(beSpecialistServiceAvailability)
            .set({
              roomId: input.roomId ?? null,
              cityCode: input.cityCode ?? null,
              priceMinorOverride: input.priceMinorOverride ?? null,
              isActive: input.isActive,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(eq(beSpecialistServiceAvailability.id, targetId))
            .returning();
          return updated[0]!;
        }

        const inserted = await tx
          .insert(beSpecialistServiceAvailability)
          .values({
            organizationId: input.organizationId,
            specialistId: input.specialistId,
            serviceId: input.serviceId,
            branchId: input.branchId ?? null,
            roomId: input.roomId ?? null,
            cityCode: input.cityCode ?? null,
            priceMinorOverride: input.priceMinorOverride ?? null,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              beSpecialistServiceAvailability.specialistId,
              beSpecialistServiceAvailability.serviceId,
              beSpecialistServiceAvailability.branchId,
              beSpecialistServiceAvailability.roomId,
              beSpecialistServiceAvailability.cityCode,
            ],
            set: {
              priceMinorOverride: input.priceMinorOverride ?? null,
              isActive: input.isActive,
              sortOrder: input.sortOrder,
              updatedAt: now,
            },
          })
          .returning();
        return inserted[0]!;
      });
      return {
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        serviceId: row.serviceId,
        branchId: row.branchId ?? null,
        roomId: row.roomId ?? null,
        cityCode: row.cityCode ?? null,
        priceMinorOverride: row.priceMinorOverride ?? null,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      };
    },

    async listSpecialistServiceAvailability(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSpecialistServiceAvailability)
        .where(eq(beSpecialistServiceAvailability.organizationId, organizationId));
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        serviceId: row.serviceId,
        branchId: row.branchId ?? null,
        roomId: row.roomId ?? null,
        cityCode: row.cityCode ?? null,
        priceMinorOverride: row.priceMinorOverride ?? null,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      }));
    },

    async deactivateSpecialistServiceAvailability(id) {
      const res = await runWebappTransaction((tx) =>
        tx
          .update(beSpecialistServiceAvailability)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(beSpecialistServiceAvailability.id, id)),
      );
      return (res.rowCount ?? 0) > 0;
    },

    async upsertServiceLocationAvailability(input) {
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beServiceLocationAvailability)
          .values({
            organizationId: input.organizationId,
            serviceId: input.serviceId,
            branchId: input.branchId,
            isActive: input.isActive,
          })
          .onConflictDoUpdate({
            target: [
              beServiceLocationAvailability.serviceId,
              beServiceLocationAvailability.branchId,
            ],
            set: { isActive: input.isActive },
          })
          .returning(),
      );
      const row = inserted[0]!;
      return {
        id: row.id,
        organizationId: row.organizationId,
        serviceId: row.serviceId,
        branchId: row.branchId,
        isActive: row.isActive,
      };
    },

    async setSoloServiceLocationAvailability(input) {
      return runWebappTransaction(async (tx) => {
        const serviceRows = await tx
          .select({ id: beClinicServices.id })
          .from(beClinicServices)
          .where(
            and(
              eq(beClinicServices.id, input.serviceId),
              eq(beClinicServices.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!serviceRows[0]) throw new Error('service_not_found');

        const branchRows = await tx
          .select({ id: beBranches.id })
          .from(beBranches)
          .where(
            and(
              eq(beBranches.id, input.branchId),
              eq(beBranches.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!branchRows[0]) throw new Error('branch_not_found');

        const specialistRows = await tx
          .select({ id: beSpecialists.id })
          .from(beSpecialists)
          .where(
            and(
              eq(beSpecialists.id, input.specialistId),
              eq(beSpecialists.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!specialistRows[0]) throw new Error('specialist_not_found');

        const locationRows = await tx
          .insert(beServiceLocationAvailability)
          .values({
            organizationId: input.organizationId,
            serviceId: input.serviceId,
            branchId: input.branchId,
            isActive: input.isActive,
          })
          .onConflictDoUpdate({
            target: [
              beServiceLocationAvailability.serviceId,
              beServiceLocationAvailability.branchId,
            ],
            set: { isActive: input.isActive },
          })
          .returning();
        const locationRow = locationRows[0]!;

        const exactSpecialistRows = await tx
          .select()
          .from(beSpecialistServiceAvailability)
          .where(
            and(
              eq(beSpecialistServiceAvailability.organizationId, input.organizationId),
              eq(beSpecialistServiceAvailability.specialistId, input.specialistId),
              eq(beSpecialistServiceAvailability.serviceId, input.serviceId),
              eq(beSpecialistServiceAvailability.branchId, input.branchId),
              isNull(beSpecialistServiceAvailability.roomId),
              isNull(beSpecialistServiceAvailability.cityCode),
            ),
          );
        const preferredSpecialistRowId = pickPreferredSsaId(
          exactSpecialistRows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            isActive: row.isActive,
          })),
        );
        const now = new Date().toISOString();
        const specialistAvailabilityRows = preferredSpecialistRowId
          ? await (async () => {
              // Exact historical duplicates are possible because room/city are nullable.
              // Converge the whole exact set first so an inactive duplicate cannot keep
              // the public OR-availability visible after the owner switches it off.
              await tx
                .update(beSpecialistServiceAvailability)
                .set({ isActive: false, updatedAt: now })
                .where(
                  inArray(
                    beSpecialistServiceAvailability.id,
                    exactSpecialistRows.map((row) => row.id),
                  ),
                );
              return tx
                .update(beSpecialistServiceAvailability)
                .set({
                  priceMinorOverride: null,
                  isActive: input.isActive,
                  sortOrder: 0,
                  updatedAt: now,
                })
                .where(eq(beSpecialistServiceAvailability.id, preferredSpecialistRowId))
                .returning();
            })()
          : await tx
              .insert(beSpecialistServiceAvailability)
              .values({
                organizationId: input.organizationId,
                specialistId: input.specialistId,
                serviceId: input.serviceId,
                branchId: input.branchId,
                roomId: null,
                cityCode: null,
                priceMinorOverride: null,
                isActive: input.isActive,
                sortOrder: 0,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
        const specialistRow = specialistAvailabilityRows[0]!;

        return {
          locationAvailability: {
            id: locationRow.id,
            organizationId: locationRow.organizationId,
            serviceId: locationRow.serviceId,
            branchId: locationRow.branchId,
            isActive: locationRow.isActive,
          },
          specialistAvailability: {
            id: specialistRow.id,
            organizationId: specialistRow.organizationId,
            specialistId: specialistRow.specialistId,
            serviceId: specialistRow.serviceId,
            branchId: specialistRow.branchId ?? null,
            roomId: specialistRow.roomId ?? null,
            cityCode: specialistRow.cityCode ?? null,
            priceMinorOverride: specialistRow.priceMinorOverride ?? null,
            isActive: specialistRow.isActive,
            sortOrder: specialistRow.sortOrder,
          },
        };
      });
    },

    async listServiceLocationAvailability(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beServiceLocationAvailability)
        .where(eq(beServiceLocationAvailability.organizationId, organizationId));
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        serviceId: row.serviceId,
        branchId: row.branchId,
        isActive: row.isActive,
      }));
    },

    async getSpecialistAppointmentReminderSettings({ organizationId, specialistId }) {
      const db = getDrizzle();
      const rows = await db
        .select({
          allowedPresetIds: beSpecialists.appointmentReminderAllowedPresetIds,
          defaultPresetId: beSpecialists.appointmentReminderDefaultPresetId,
        })
        .from(beSpecialists)
        .where(
          and(
            eq(beSpecialists.id, specialistId),
            eq(beSpecialists.organizationId, organizationId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row
        ? normalizeAppointmentReminderSettings({
            allowedPresetIds: row.allowedPresetIds ?? [],
            defaultPresetId: row.defaultPresetId ?? null,
          })
        : null;
    },

    async updateSpecialistAppointmentReminderSettings({ organizationId, specialistId, settings }) {
      const db = getDrizzle();
      const result = await db
        .update(beSpecialists)
        .set({
          appointmentReminderAllowedPresetIds: settings.allowedPresetIds,
          appointmentReminderDefaultPresetId: settings.defaultPresetId,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(beSpecialists.id, specialistId),
            eq(beSpecialists.organizationId, organizationId),
          ),
        );
      return (result.rowCount ?? 0) === 1;
    },

    async setPatientAppointmentReminderPreset({ appointmentId, presetId }) {
      const db = getDrizzle();
      const allowedPresetPredicate =
        presetId === null
          ? undefined
          : sql`${beAppointments.appointmentReminderAllowedPresetIds} @> ${JSON.stringify([presetId])}::jsonb`;
      const result = await db
        .update(beAppointments)
        .set({
          appointmentReminderPresetId: presetId,
          appointmentReminderSelectionSource: 'patient',
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(beAppointments.id, appointmentId),
            inArray(beAppointments.status, ['confirmed', 'rescheduled']),
            allowedPresetPredicate,
          ),
        );
      return (result.rowCount ?? 0) === 1;
    },

    async getPatientAppointmentReminderPreference(appointmentId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          organizationId: beAppointments.organizationId,
          status: beAppointments.status,
          allowedPresetIds: beAppointments.appointmentReminderAllowedPresetIds,
          presetId: beAppointments.appointmentReminderPresetId,
          selectionSource: beAppointments.appointmentReminderSelectionSource,
        })
        .from(beAppointments)
        .where(eq(beAppointments.id, appointmentId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const reminderSettings = normalizeAppointmentReminderSettings({
        allowedPresetIds: row.allowedPresetIds ?? [],
        defaultPresetId: row.presetId ?? null,
      });
      return {
        organizationId: row.organizationId,
        status: row.status as AppointmentStatus,
        allowedPresetIds: reminderSettings.allowedPresetIds,
        presetId: reminderSettings.defaultPresetId,
        selectionSource: row.selectionSource === 'patient' ? 'patient' : 'specialist_default',
      };
    },

    async getAppointment(id) {
      const db = getDrizzle();
      const rows = await db.select().from(beAppointments).where(eq(beAppointments.id, id)).limit(1);
      return rows[0] ? mapAppointment(rows[0]) : null;
    },

    async listAppointmentsByChainId({ organizationId, chainId }) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointments)
        .where(
          and(
            eq(beAppointments.organizationId, organizationId),
            eq(beAppointments.chainId, chainId),
            isNull(beAppointments.deletedAt),
          ),
        )
        .orderBy(asc(beAppointments.chainPosition), asc(beAppointments.startAt));
      return rows.map(mapAppointment);
    },

    async getStatusBeforePackageCharge(appointmentId) {
      const revertTargets: AppointmentStatus[] = ['visit_confirmed', 'confirmed', 'completed'];
      const db = getDrizzle();
      const rows = await db
        .select({ payload: beAppointmentHistoryEvents.payload })
        .from(beAppointmentHistoryEvents)
        .where(eq(beAppointmentHistoryEvents.appointmentId, appointmentId))
        .orderBy(desc(beAppointmentHistoryEvents.occurredAt))
        .limit(50);
      for (const row of rows) {
        const payload = row.payload;
        if (payload?.toStatus !== 'charged_to_package') continue;
        const fromStatus = payload.fromStatus;
        if (
          typeof fromStatus === 'string' &&
          revertTargets.includes(fromStatus as AppointmentStatus)
        ) {
          return fromStatus as AppointmentStatus;
        }
      }
      return null;
    },

    async createAppointment(input: CreateAppointmentInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction((tx) => insertAppointmentInTransaction(tx as DrizzleDb, input, now));
    },

    async createOnlineAppointmentsIfAvailable(inputs) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction((tx) =>
        insertOnlineAppointmentsIfAvailableInTransaction(tx as DrizzleDb, inputs, now),
      );
    },

    async createManualPatientVisit(input: CreateManualPatientVisitInput) {
      if (getCurrentDbPrincipalOrganizationId() !== input.organizationId) {
        throw new Error('organization_principal_mismatch');
      }
      const db = getDrizzle();
      const now = new Date().toISOString();
      try {
        return await db.transaction(async (rawTx) => {
          const tx = rawTx as DrizzleDb;
          await lockManualPatientCommand(tx, input.commandId);

          if (input.kind === 'scheduled') {
            const fingerprint = scheduledManualPatientCommandFingerprint(input);
            const command = await findManualPatientCommand(tx, input.commandId);
            if (command) {
              assertManualPatientCommandReplay(command, {
                organizationId: input.organizationId,
                commandKind: 'scheduled',
                requestFingerprint: fingerprint,
              });
            }
            const [oppositeVisit] = await tx
              .select({ id: clinicalVisit.id })
              .from(clinicalVisit)
              .where(
                and(
                  eq(clinicalVisit.id, input.commandId),
                  eq(clinicalVisit.organizationId, input.organizationId),
                ),
              )
              .limit(1);
            if (oppositeVisit) throw new Error('idempotency_conflict');

            const [existingAppointmentRow] = await tx
              .select()
              .from(beAppointments)
              .where(
                and(
                  eq(beAppointments.id, input.commandId),
                  eq(beAppointments.organizationId, input.organizationId),
                ),
              )
              .limit(1);
            if (existingAppointmentRow) {
              const appointment = mapAppointment(existingAppointmentRow);
              if (
                appointment.attributionJson.manualCommandFingerprint !== fingerprint ||
                !appointment.platformUserId ||
                (command && command.platformUserId !== appointment.platformUserId)
              ) {
                throw new Error('idempotency_conflict');
              }
              if (!command) {
                await insertManualPatientCommand(tx, {
                  commandId: input.commandId,
                  organizationId: input.organizationId,
                  commandKind: 'scheduled',
                  requestFingerprint: fingerprint,
                  platformUserId: appointment.platformUserId,
                });
              }
              const replay = await loadManualPatientForReplay(
                tx,
                input.organizationId,
                appointment.platformUserId,
              );
              return {
                kind: 'scheduled' as const,
                replayed: true,
                appointment,
                clinicalVisitId: null,
                ...replay,
              };
            }
            if (command) throw new Error('idempotency_replay_missing');

            await assertManualAppointmentCatalogSelection(tx, {
              ...input.appointment,
              organizationId: input.organizationId,
            });
            const patient = await resolveOrCreateDoctorClientByPhoneInTransaction(
              tx,
              input.organizationId,
              input,
            );
            const relationshipStatus = await ensureInvitedOrganizationClientRelationship(
              tx,
              input.organizationId,
              patient.userId,
            );
            let appointment: BeAppointment;
            try {
              appointment = await insertAppointmentInTransaction(
                tx,
                {
                  ...input.appointment,
                  id: input.commandId,
                  organizationId: input.organizationId,
                  platformUserId: patient.userId,
                  phoneNormalized: patient.phoneNormalized,
                  attributionJson: {
                    ...input.appointment.attributionJson,
                    manualCommandFingerprint: fingerprint,
                  },
                },
                now,
                true,
              );
            } catch (error) {
              if (isCommandPrimaryKeyConflict(error)) throw new Error('idempotency_conflict');
              throw error;
            }
            await insertManualPatientCommand(tx, {
              commandId: input.commandId,
              organizationId: input.organizationId,
              commandKind: 'scheduled',
              requestFingerprint: fingerprint,
              platformUserId: patient.userId,
            });
            return {
              kind: 'scheduled' as const,
              replayed: false,
              patient,
              appointment,
              clinicalVisitId: null,
              portalStatus:
                relationshipStatus === 'active' ? ('linked' as const) : ('not_activated' as const),
            };
          }

          const fingerprint = walkInManualPatientCommandFingerprint(input);
          const command = await findManualPatientCommand(tx, input.commandId);
          if (command) {
            assertManualPatientCommandReplay(command, {
              organizationId: input.organizationId,
              commandKind: 'walk_in',
              requestFingerprint: fingerprint,
            });
          }
          const [oppositeAppointment] = await tx
            .select({ id: beAppointments.id })
            .from(beAppointments)
            .where(
              and(
                eq(beAppointments.id, input.commandId),
                eq(beAppointments.organizationId, input.organizationId),
              ),
            )
            .limit(1);
          if (oppositeAppointment) throw new Error('idempotency_conflict');

          await assertManualSpecialistSelection(
            tx,
            input.organizationId,
            input.walkIn.specialistId,
          );
          if (input.phoneNormalized === null || command) {
            const [existingContactlessVisit] = await tx
              .select({
                id: clinicalVisit.id,
                patientUserId: clinicalVisit.patientUserId,
                visitedAt: clinicalVisit.visitedAt,
                createdBy: clinicalVisit.createdBy,
              })
              .from(clinicalVisit)
              .where(
                and(
                  eq(clinicalVisit.id, input.commandId),
                  eq(clinicalVisit.organizationId, input.organizationId),
                ),
              )
              .limit(1);
            if (existingContactlessVisit) {
              if (
                new Date(existingContactlessVisit.visitedAt).getTime() !==
                  new Date(input.walkIn.visitedAt).getTime() ||
                existingContactlessVisit.createdBy !== input.walkIn.actorId ||
                (command && command.platformUserId !== existingContactlessVisit.patientUserId)
              ) {
                throw new Error('idempotency_conflict');
              }
              if (!command) {
                await insertManualPatientCommand(tx, {
                  commandId: input.commandId,
                  organizationId: input.organizationId,
                  commandKind: 'walk_in',
                  requestFingerprint: fingerprint,
                  platformUserId: existingContactlessVisit.patientUserId,
                });
              }
              const replay = await loadManualPatientForReplay(
                tx,
                input.organizationId,
                existingContactlessVisit.patientUserId,
              );
              return {
                kind: 'walk_in' as const,
                replayed: true,
                appointment: null,
                clinicalVisitId: existingContactlessVisit.id,
                ...replay,
              };
            }
            if (command) throw new Error('idempotency_replay_missing');
          }
          const patient = await resolveOrCreateDoctorClientByPhoneInTransaction(
            tx,
            input.organizationId,
            input,
          );
          await ensureInvitedOrganizationClientRelationship(
            tx,
            input.organizationId,
            patient.userId,
          );
          const relationshipStatus = await lockManualPatientRelationship(
            tx,
            input.organizationId,
            patient.userId,
          );
          const [existingVisit] = await tx
            .select({
              id: clinicalVisit.id,
              patientUserId: clinicalVisit.patientUserId,
              visitedAt: clinicalVisit.visitedAt,
              createdBy: clinicalVisit.createdBy,
            })
            .from(clinicalVisit)
            .where(
              and(
                eq(clinicalVisit.id, input.commandId),
                eq(clinicalVisit.organizationId, input.organizationId),
              ),
            )
            .limit(1);
          if (existingVisit) {
            if (
              existingVisit.patientUserId !== patient.userId ||
              new Date(existingVisit.visitedAt).getTime() !==
                new Date(input.walkIn.visitedAt).getTime() ||
              existingVisit.createdBy !== input.walkIn.actorId
            ) {
              throw new Error('idempotency_conflict');
            }
            await insertManualPatientCommand(tx, {
              commandId: input.commandId,
              organizationId: input.organizationId,
              commandKind: 'walk_in',
              requestFingerprint: fingerprint,
              platformUserId: patient.userId,
            });
            return {
              kind: 'walk_in' as const,
              replayed: true,
              patient: { ...patient, created: false },
              appointment: null,
              clinicalVisitId: existingVisit.id,
              portalStatus:
                relationshipStatus === 'active' ? ('linked' as const) : ('not_activated' as const),
            };
          }

          const [priorVisit] = await tx
            .select({ id: clinicalVisit.id })
            .from(clinicalVisit)
            .where(
              and(
                eq(clinicalVisit.organizationId, input.organizationId),
                eq(clinicalVisit.patientUserId, patient.userId),
              ),
            )
            .limit(1);
          let clinicalVisitId: string | null = null;
          try {
            const insertedVisit = await tx
              .insert(clinicalVisit)
              .values({
                id: input.commandId,
                organizationId: input.organizationId,
                patientUserId: patient.userId,
                visitType: priorVisit ? 'repeat' : 'first',
                visitedAt: input.walkIn.visitedAt,
                canonicalAppointmentId: null,
                createdBy: input.walkIn.actorId,
              })
              .returning({ id: clinicalVisit.id });
            clinicalVisitId = insertedVisit[0]?.id ?? null;
          } catch (error) {
            if (isCommandPrimaryKeyConflict(error)) throw new Error('idempotency_conflict');
            throw error;
          }
          if (!clinicalVisitId) throw new Error('clinical_visit_insert_failed');
          await insertManualPatientCommand(tx, {
            commandId: input.commandId,
            organizationId: input.organizationId,
            commandKind: 'walk_in',
            requestFingerprint: fingerprint,
            platformUserId: patient.userId,
          });
          return {
            kind: 'walk_in' as const,
            replayed: false,
            patient,
            appointment: null,
            clinicalVisitId,
            portalStatus:
              relationshipStatus === 'active' ? ('linked' as const) : ('not_activated' as const),
          };
        });
      } catch (error) {
        if (isManualPatientCommandUniqueViolation(error)) {
          throw new Error('idempotency_conflict');
        }
        throw error;
      }
    },

    async createAppointmentChain(inputs) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const appointments = [];
        for (const input of inputs) {
          const status = input.status ?? 'created';
          const inserted = await tx
            .insert(beAppointments)
            .values({
              organizationId: input.organizationId,
              branchId: input.branchId ?? null,
              roomId: input.roomId ?? null,
              specialistId: input.specialistId ?? null,
              serviceId: input.serviceId ?? null,
              platformUserId: input.platformUserId ?? null,
              startAt: input.startAt,
              endAt: input.endAt,
              durationMinutes: input.durationMinutes,
              chainId: input.chainId ?? null,
              chainPosition: input.chainPosition ?? null,
              source: input.source,
              status,
              originalStartAt: input.startAt,
              rescheduleCount: 0,
              phoneNormalized: input.phoneNormalized ?? null,
              attributionJson: input.attributionJson ?? {},
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          const appt = mapAppointment(inserted[0]!);
          await tx.insert(beAppointmentEvents).values({
            organizationId: appt.organizationId,
            appointmentId: appt.id,
            eventType: 'created',
            actorId: input.actorId ?? null,
            payload: { status },
          });
          await tx.insert(beAppointmentHistoryEvents).values({
            organizationId: appt.organizationId,
            appointmentId: appt.id,
            eventType: 'created',
            actorId: input.actorId ?? null,
            payload: { status },
            occurredAt: now,
          });
          if (appt.platformUserId) {
            await tx.insert(bePatientTimelineEvents).values({
              organizationId: appt.organizationId,
              platformUserId: appt.platformUserId,
              domain: 'appointment',
              eventType: 'appointment_created',
              linkedObjectType: 'appointment',
              linkedObjectId: appt.id,
              payload: { status },
              occurredAt: now,
            });
          }
          appointments.push(appt);
        }
        return appointments;
      });
    },

    async transitionAppointmentStatus(input: TransitionAppointmentStatusInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(eq(beAppointments.id, input.appointmentId))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new Error('appointment_not_found');
        const fromStatus = current.status;
        await tx
          .update(beAppointments)
          .set({
            status: input.toStatus,
            updatedAt: now,
            rescheduleCount:
              input.toStatus === 'rescheduled'
                ? current.rescheduleCount + 1
                : current.rescheduleCount,
          })
          .where(eq(beAppointments.id, input.appointmentId));
        const payload = { fromStatus, toStatus: input.toStatus, ...(input.payload ?? {}) };
        await tx.insert(beAppointmentEvents).values({
          organizationId: current.organizationId,
          appointmentId: input.appointmentId,
          eventType: 'status_changed',
          actorId: input.actorId ?? null,
          payload,
        });
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: current.organizationId,
          appointmentId: input.appointmentId,
          eventType: 'status_changed',
          actorId: input.actorId ?? null,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: current.organizationId,
            platformUserId: current.platformUserId,
            domain: 'appointment',
            eventType: 'appointment_status_changed',
            linkedObjectType: 'appointment',
            linkedObjectId: input.appointmentId,
            payload,
            occurredAt: now,
          });
        }
        const updated = await tx
          .select()
          .from(beAppointments)
          .where(eq(beAppointments.id, input.appointmentId))
          .limit(1);
        return mapAppointment(updated[0]!);
      });
    },

    async deleteAppointmentHard(input: { organizationId: string; appointmentId: string }) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        await tx
          .delete(bePatientTimelineEvents)
          .where(
            and(
              eq(bePatientTimelineEvents.organizationId, input.organizationId),
              eq(bePatientTimelineEvents.domain, 'appointment'),
              eq(bePatientTimelineEvents.linkedObjectType, 'appointment'),
              eq(bePatientTimelineEvents.linkedObjectId, input.appointmentId),
            ),
          );
        await tx
          .delete(beExternalEntityMappings)
          .where(
            and(
              eq(beExternalEntityMappings.organizationId, input.organizationId),
              eq(beExternalEntityMappings.entityType, 'appointment'),
              eq(beExternalEntityMappings.canonicalId, input.appointmentId),
            ),
          );
        const deleted = await tx
          .delete(beAppointments)
          .where(
            and(
              eq(beAppointments.organizationId, input.organizationId),
              eq(beAppointments.id, input.appointmentId),
            ),
          )
          .returning({ id: beAppointments.id });
        return deleted.length > 0;
      });
    },

    async listSpecialistRooms(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: beSpecialistRooms.id,
          specialistId: beSpecialistRooms.specialistId,
          roomId: beSpecialistRooms.roomId,
          isActive: beSpecialistRooms.isActive,
        })
        .from(beSpecialistRooms)
        .where(eq(beSpecialistRooms.organizationId, organizationId));
      return rows;
    },
  };
}
