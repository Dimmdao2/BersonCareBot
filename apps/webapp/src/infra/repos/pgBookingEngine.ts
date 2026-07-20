import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle, type DrizzleDb } from "@/app-layer/db/drizzle";
import { runWebappTransaction } from "@/infra/db/runWebappSql";
import { readAdminSystemSettingString } from "@/infra/repos/pgSystemSettings";
import { resolveOrCreateDoctorClientByPhoneInTransaction } from "@/infra/repos/pgDoctorClientCreate";
import { ensureInvitedOrganizationClientRelationship } from "@/infra/repos/pgPatientOrganizationEnrollment";
import { BE_DEFAULT_ORGANIZATION_ID } from "../../../db/schema/bookingEngine";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  beBranches,
  beClinicServices,
  beExternalEntityMappings,
  beOrganizations,
  bePatientTimelineEvents,
  beRooms,
  beServiceLocationAvailability,
  beSpecialistLocations,
  beSpecialistRooms,
  beSpecialistServiceAvailability,
  beSpecialists,
} from "../../../db/schema/bookingEngine";
import {
  legacyBranchServiceIdBySsaFromMappings,
  pickPreferredSsaId,
} from "@/modules/booking-scheduling/ssaResolve";
import type { BookingEngineCorePort } from "@/modules/booking-engine/ports";
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
  TransitionAppointmentStatusInput,
} from "@/modules/booking-engine/types";

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
  return {
    id: row.id,
    organizationId: row.organizationId,
    fullName: row.fullName,
    description: row.description ?? null,
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
    source: row.source as BeAppointment["source"],
    status: row.status as BeAppointment["status"],
    originalStartAt: row.originalStartAt ?? null,
    rescheduleCount: row.rescheduleCount,
    paymentRef: row.paymentRef ?? null,
    packageUsageRef: row.packageUsageRef ?? null,
    phoneNormalized: row.phoneNormalized ?? null,
    attributionJson: (row.attributionJson ?? {}) as Record<string, unknown>,
  };
}

async function insertAppointmentInTransaction(
  tx: DrizzleDb,
  input: CreateAppointmentInput,
  now: string,
): Promise<BeAppointment> {
  const status = input.status ?? "created";
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
  const appointment = mapAppointment(inserted[0]!);
  await tx.insert(beAppointmentEvents).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    eventType: "created",
    actorId: input.actorId ?? null,
    payload: { status },
  });
  await tx.insert(beAppointmentHistoryEvents).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    eventType: "created",
    actorId: input.actorId ?? null,
    payload: { status },
    occurredAt: now,
  });
  if (appointment.platformUserId) {
    await tx.insert(bePatientTimelineEvents).values({
      organizationId: appointment.organizationId,
      platformUserId: appointment.platformUserId,
      domain: "appointment",
      eventType: "appointment_created",
      linkedObjectType: "appointment",
      linkedObjectId: appointment.id,
      payload: { status },
      occurredAt: now,
    });
  }
  return appointment;
}

export function createPgBookingEnginePort(): BookingEngineCorePort {
  return {
    async getDefaultOrganizationId() {
      const fromSettings = await readAdminSystemSettingString("booking_default_organization_id");
      return fromSettings && fromSettings.length > 0 ? fromSettings : BE_DEFAULT_ORGANIZATION_ID;
    },

    async getOrganization(id) {
      const db = getDrizzle();
      const rows = await db.select().from(beOrganizations).where(eq(beOrganizations.id, id)).limit(1);
      return rows[0] ? mapOrg(rows[0]) : null;
    },

    async listOrganizations() {
      const db = getDrizzle();
      const rows = await db.select().from(beOrganizations).orderBy(asc(beOrganizations.sortOrder), asc(beOrganizations.title));
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
      if (updated.length === 0) throw new Error("organization_not_found");
      const row = await this.getOrganization(id);
      if (!row) throw new Error("organization_not_found");
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
          const patch: Partial<typeof beBranches.$inferInsert> = {
            title: input.title,
            cityCode: input.cityCode,
            address: input.address ?? null,
            timezone: input.timezone ?? "Europe/Moscow",
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          };
          // Only write shortTitle when explicitly provided (preserve existing value otherwise)
          if ("shortTitle" in input) {
            patch.shortTitle = (input as { shortTitle?: string | null }).shortTitle ?? null;
          }
          if ("color" in input) {
            patch.color = (input as { color?: string | null }).color ?? null;
          }
          await tx.update(beBranches).set(patch).where(eq(beBranches.id, id));
          const rows = await tx.select().from(beBranches).where(eq(beBranches.id, id)).limit(1);
          return rows[0] ? mapBranch(rows[0]) : null;
        });
        if (!row) throw new Error("branch_not_found");
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
            timezone: input.timezone ?? "Europe/Moscow",
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapBranch(inserted[0]!);
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
      const rows = await db.select().from(beRooms).where(cond).orderBy(asc(beRooms.sortOrder), asc(beRooms.title));
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
        if (!row) throw new Error("room_not_found");
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
          const rows = await tx.select().from(beSpecialists).where(eq(beSpecialists.id, id)).limit(1);
          return rows[0] ? mapSpecialist(rows[0]) : null;
        });
        if (!row) throw new Error("specialist_not_found");
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
      const rows = await db.select().from(beClinicServices).where(eq(beClinicServices.id, id)).limit(1);
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
          const rows = await tx.select().from(beClinicServices).where(eq(beClinicServices.id, id)).limit(1);
          return rows[0] ? mapService(rows[0]) : null;
        });
        if (!row) throw new Error("service_not_found");
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx.insert(beClinicServices).values({ ...values, createdAt: now }).returning(),
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

        let targetId: string | null = null;
        if (existingRows.length > 0) {
          const mapRows = await tx
            .select({
              canonicalId: beExternalEntityMappings.canonicalId,
              metadata: beExternalEntityMappings.metadata,
            })
            .from(beExternalEntityMappings)
            .where(
              and(
                eq(beExternalEntityMappings.organizationId, input.organizationId),
                eq(beExternalEntityMappings.entityType, "availability"),
                eq(beExternalEntityMappings.externalSystem, "rubitime"),
                inArray(
                  beExternalEntityMappings.canonicalId,
                  existingRows.map((r) => r.id),
                ),
              ),
            );
          const legacyBySsa = legacyBranchServiceIdBySsaFromMappings(mapRows);
          targetId = pickPreferredSsaId(
            existingRows.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              isActive: r.isActive,
            })),
            legacyBySsa,
          );
        }

        if (targetId) {
          const updated = await tx
            .update(beSpecialistServiceAvailability)
            .set({
              roomId: input.roomId ?? null,
              cityCode: input.cityCode ?? null,
              durationMinutesOverride: input.durationMinutesOverride ?? null,
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
            durationMinutesOverride: input.durationMinutesOverride ?? null,
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
              durationMinutesOverride: input.durationMinutesOverride ?? null,
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
        durationMinutesOverride: row.durationMinutesOverride ?? null,
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
        durationMinutesOverride: row.durationMinutesOverride ?? null,
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
            target: [beServiceLocationAvailability.serviceId, beServiceLocationAvailability.branchId],
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
        if (!serviceRows[0]) throw new Error("service_not_found");

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
        if (!branchRows[0]) throw new Error("branch_not_found");

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
        if (!specialistRows[0]) throw new Error("specialist_not_found");

        const locationRows = await tx
          .insert(beServiceLocationAvailability)
          .values({
            organizationId: input.organizationId,
            serviceId: input.serviceId,
            branchId: input.branchId,
            isActive: input.isActive,
          })
          .onConflictDoUpdate({
            target: [beServiceLocationAvailability.serviceId, beServiceLocationAvailability.branchId],
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
        const mappingRows =
          exactSpecialistRows.length > 0
            ? await tx
                .select({
                  canonicalId: beExternalEntityMappings.canonicalId,
                  metadata: beExternalEntityMappings.metadata,
                })
                .from(beExternalEntityMappings)
                .where(
                  and(
                    eq(beExternalEntityMappings.organizationId, input.organizationId),
                    eq(beExternalEntityMappings.entityType, "availability"),
                    eq(beExternalEntityMappings.externalSystem, "rubitime"),
                    inArray(
                      beExternalEntityMappings.canonicalId,
                      exactSpecialistRows.map((row) => row.id),
                    ),
                  ),
                )
            : [];
        const preferredSpecialistRowId = pickPreferredSsaId(
          exactSpecialistRows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            isActive: row.isActive,
          })),
          legacyBranchServiceIdBySsaFromMappings(mappingRows),
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
                  durationMinutesOverride: null,
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
                durationMinutesOverride: null,
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
            durationMinutesOverride: specialistRow.durationMinutesOverride ?? null,
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

    async getRubitimeAppointmentId(input: { organizationId: string; appointmentId: string }) {
      const db = getDrizzle();
      const rows = await db
        .select({ externalId: beExternalEntityMappings.externalId })
        .from(beExternalEntityMappings)
        .where(
          and(
            eq(beExternalEntityMappings.organizationId, input.organizationId),
            eq(beExternalEntityMappings.entityType, "appointment"),
            eq(beExternalEntityMappings.externalSystem, "rubitime"),
            eq(beExternalEntityMappings.canonicalId, input.appointmentId),
          ),
        )
        .orderBy(desc(beExternalEntityMappings.updatedAt))
        .limit(1);
      return rows[0]?.externalId?.trim() || null;
    },

    async getAppointmentIdByRubitimeExternalId(input: { organizationId: string; rubitimeId: string }) {
      const rubitimeId = input.rubitimeId.trim();
      if (!rubitimeId) return null;
      const db = getDrizzle();
      const rows = await db
        .select({ canonicalId: beExternalEntityMappings.canonicalId })
        .from(beExternalEntityMappings)
        .where(
          and(
            eq(beExternalEntityMappings.organizationId, input.organizationId),
            eq(beExternalEntityMappings.entityType, "appointment"),
            eq(beExternalEntityMappings.externalSystem, "rubitime"),
            eq(beExternalEntityMappings.externalId, rubitimeId),
          ),
        )
        .limit(1);
      const id = rows[0]?.canonicalId?.trim();
      return id || null;
    },

    async getStatusBeforePackageCharge(appointmentId) {
      const revertTargets: AppointmentStatus[] = ["visit_confirmed", "confirmed", "completed"];
      const db = getDrizzle();
      const rows = await db
        .select({ payload: beAppointmentHistoryEvents.payload })
        .from(beAppointmentHistoryEvents)
        .where(eq(beAppointmentHistoryEvents.appointmentId, appointmentId))
        .orderBy(desc(beAppointmentHistoryEvents.occurredAt))
        .limit(50);
      for (const row of rows) {
        const payload = row.payload;
        if (payload?.toStatus !== "charged_to_package") continue;
        const fromStatus = payload.fromStatus;
        if (typeof fromStatus === "string" && revertTargets.includes(fromStatus as AppointmentStatus)) {
          return fromStatus as AppointmentStatus;
        }
      }
      return null;
    },

    async createAppointment(input: CreateAppointmentInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction((tx) =>
        insertAppointmentInTransaction(tx as DrizzleDb, input, now),
      );
    },

    async createManualPatientVisit(input: CreateManualPatientVisitInput) {
      if (getCurrentDbPrincipalOrganizationId() !== input.organizationId) {
        throw new Error("organization_principal_mismatch");
      }
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (rawTx) => {
        const tx = rawTx as DrizzleDb;
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
        const appointment = await insertAppointmentInTransaction(
          tx,
          {
            ...input.appointment,
            organizationId: input.organizationId,
            platformUserId: patient.userId,
            phoneNormalized: patient.phoneNormalized,
          },
          now,
        );
        return { patient, appointment };
      });
    },

    async createAppointmentChain(inputs) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const appointments = [];
        for (const input of inputs) {
          const status = input.status ?? "created";
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
            organizationId: appt.organizationId, appointmentId: appt.id, eventType: "created",
            actorId: input.actorId ?? null, payload: { status },
          });
          await tx.insert(beAppointmentHistoryEvents).values({
            organizationId: appt.organizationId, appointmentId: appt.id, eventType: "created",
            actorId: input.actorId ?? null, payload: { status }, occurredAt: now,
          });
          if (appt.platformUserId) {
            await tx.insert(bePatientTimelineEvents).values({
              organizationId: appt.organizationId, platformUserId: appt.platformUserId,
              domain: "appointment", eventType: "appointment_created", linkedObjectType: "appointment",
              linkedObjectId: appt.id, payload: { status }, occurredAt: now,
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
        if (!current) throw new Error("appointment_not_found");
        const fromStatus = current.status;
        await tx
          .update(beAppointments)
          .set({
            status: input.toStatus,
            updatedAt: now,
            rescheduleCount:
              input.toStatus === "rescheduled" ? current.rescheduleCount + 1 : current.rescheduleCount,
          })
          .where(eq(beAppointments.id, input.appointmentId));
        const payload = { fromStatus, toStatus: input.toStatus, ...(input.payload ?? {}) };
        await tx.insert(beAppointmentEvents).values({
          organizationId: current.organizationId,
          appointmentId: input.appointmentId,
          eventType: "status_changed",
          actorId: input.actorId ?? null,
          payload,
        });
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: current.organizationId,
          appointmentId: input.appointmentId,
          eventType: "status_changed",
          actorId: input.actorId ?? null,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: current.organizationId,
            platformUserId: current.platformUserId,
            domain: "appointment",
            eventType: "appointment_status_changed",
            linkedObjectType: "appointment",
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
              eq(bePatientTimelineEvents.domain, "appointment"),
              eq(bePatientTimelineEvents.linkedObjectType, "appointment"),
              eq(bePatientTimelineEvents.linkedObjectId, input.appointmentId),
            ),
          );
        await tx
          .delete(beExternalEntityMappings)
          .where(
            and(
              eq(beExternalEntityMappings.organizationId, input.organizationId),
              eq(beExternalEntityMappings.entityType, "appointment"),
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

    async softDeleteAppointmentByRubitimeExternalId(input: {
      organizationId: string;
      rubitimeId: string;
    }) {
      const rubitimeId = input.rubitimeId.trim();
      if (!rubitimeId) return false;
      const db = getDrizzle();
      const mapped = await db
        .select({ canonicalId: beExternalEntityMappings.canonicalId })
        .from(beExternalEntityMappings)
        .where(
          and(
            eq(beExternalEntityMappings.organizationId, input.organizationId),
            eq(beExternalEntityMappings.entityType, "appointment"),
            eq(beExternalEntityMappings.externalSystem, "rubitime"),
            eq(beExternalEntityMappings.externalId, rubitimeId),
          ),
        )
        .limit(1);
      const canonicalId = mapped[0]?.canonicalId?.trim();
      if (!canonicalId) return false;
      const updated = await db
        .update(beAppointments)
        .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            eq(beAppointments.organizationId, input.organizationId),
            eq(beAppointments.id, canonicalId),
            isNull(beAppointments.deletedAt),
          ),
        )
        .returning({ id: beAppointments.id });
      return updated.length > 0;
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

    async upsertRubitimeAppointmentMapping(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      await db
        .insert(beExternalEntityMappings)
        .values({
          organizationId: input.organizationId,
          entityType: "appointment",
          canonicalId: input.appointmentId,
          externalSystem: "rubitime",
          externalId: input.rubitimeId.trim(),
          metadata: { patient_booking_sync: true },
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            beExternalEntityMappings.externalSystem,
            beExternalEntityMappings.entityType,
            beExternalEntityMappings.externalId,
          ],
          set: {
            canonicalId: input.appointmentId,
            updatedAt: now,
          },
        });
    },
  };
}
