import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
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

async function readSettingString(key: string): Promise<string | null> {
  const db = getDrizzle();
  const rows = await db.execute<{ value_json: unknown }>(
    sql`SELECT value_json FROM system_settings WHERE key = ${key} AND scope = 'admin' LIMIT 1`,
  );
  const row = rows.rows[0];
  if (!row?.value_json || typeof row.value_json !== "object") return null;
  const envelope = row.value_json as { value?: unknown };
  return typeof envelope.value === "string" ? envelope.value.trim() : null;
}

export function createPgBookingEnginePort(): BookingEngineCorePort {
  return {
    async getDefaultOrganizationId() {
      const fromSettings = await readSettingString("booking_default_organization_id");
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
      await db
        .insert(beOrganizations)
        .values({
          id,
          title: input.title,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: beOrganizations.id,
          set: {
            title: input.title,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          },
        });
      const row = await this.getOrganization(id);
      if (!row) throw new Error("organization_upsert_failed");
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
      const db = getDrizzle();
      const now = new Date().toISOString();
      if (input.id) {
        await db
          .update(beBranches)
          .set({
            title: input.title,
            cityCode: input.cityCode,
            address: input.address ?? null,
            timezone: input.timezone ?? "Europe/Moscow",
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          })
          .where(eq(beBranches.id, input.id));
        const row = await this.getBranch(input.id);
        if (!row) throw new Error("branch_not_found");
        return row;
      }
      const inserted = await db
        .insert(beBranches)
        .values({
          organizationId: input.organizationId,
          title: input.title,
          cityCode: input.cityCode,
          address: input.address ?? null,
          timezone: input.timezone ?? "Europe/Moscow",
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapBranch(inserted[0]!);
    },

    async deactivateBranch(id) {
      const db = getDrizzle();
      const res = await db
        .update(beBranches)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(beBranches.id, id));
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
      const db = getDrizzle();
      const now = new Date().toISOString();
      if (input.id) {
        await db
          .update(beRooms)
          .set({
            title: input.title,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          })
          .where(eq(beRooms.id, input.id));
        const row = await this.getRoom(input.id);
        if (!row) throw new Error("room_not_found");
        return row;
      }
      const inserted = await db
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
        .returning();
      return mapRoom(inserted[0]!);
    },

    async deactivateRoom(id) {
      const db = getDrizzle();
      const res = await db
        .update(beRooms)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(beRooms.id, id));
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
      const db = getDrizzle();
      const now = new Date().toISOString();
      if (input.id) {
        await db
          .update(beSpecialists)
          .set({
            fullName: input.fullName,
            description: input.description ?? null,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            updatedAt: now,
          })
          .where(eq(beSpecialists.id, input.id));
        const row = await this.getSpecialist(input.id);
        if (!row) throw new Error("specialist_not_found");
        return row;
      }
      const inserted = await db
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
        .returning();
      return mapSpecialist(inserted[0]!);
    },

    async deactivateSpecialist(id) {
      const db = getDrizzle();
      const res = await db
        .update(beSpecialists)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(beSpecialists.id, id));
      return (res.rowCount ?? 0) > 0;
    },

    async setSpecialistLocation(input) {
      const db = getDrizzle();
      await db
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
        });
    },

    async setSpecialistRoom(input) {
      const db = getDrizzle();
      await db
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
        });
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
      const db = getDrizzle();
      const now = new Date().toISOString();
      const values = {
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
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
        await db.update(beClinicServices).set(values).where(eq(beClinicServices.id, input.id));
        const row = await this.getService(input.id);
        if (!row) throw new Error("service_not_found");
        return row;
      }
      const inserted = await db
        .insert(beClinicServices)
        .values({ ...values, createdAt: now })
        .returning();
      return mapService(inserted[0]!);
    },

    async deactivateService(id) {
      const db = getDrizzle();
      const res = await db
        .update(beClinicServices)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(beClinicServices.id, id));
      return (res.rowCount ?? 0) > 0;
    },

    async upsertSpecialistServiceAvailability(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();

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

      const existingRows = await db
        .select()
        .from(beSpecialistServiceAvailability)
        .where(and(...scopeConds, eq(beSpecialistServiceAvailability.isActive, true)));

      let targetId: string | null = null;
      if (existingRows.length > 0) {
        const mapRows = await db
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
        const updated = await db
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
        const row = updated[0]!;
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
      }

      const inserted = await db
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
      const row = inserted[0]!;
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
      const db = getDrizzle();
      const res = await db
        .update(beSpecialistServiceAvailability)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(beSpecialistServiceAvailability.id, id));
      return (res.rowCount ?? 0) > 0;
    },

    async upsertServiceLocationAvailability(input) {
      const db = getDrizzle();
      const inserted = await db
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
      const row = inserted[0]!;
      return {
        id: row.id,
        organizationId: row.organizationId,
        serviceId: row.serviceId,
        branchId: row.branchId,
        isActive: row.isActive,
      };
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
      const status = input.status ?? "created";
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
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
          eventType: "created",
          actorId: input.actorId ?? null,
          payload: { status },
        });
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: appt.organizationId,
          appointmentId: appt.id,
          eventType: "created",
          actorId: input.actorId ?? null,
          payload: { status },
          occurredAt: now,
        });
        if (appt.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: appt.organizationId,
            platformUserId: appt.platformUserId,
            domain: "appointment",
            eventType: "appointment_created",
            linkedObjectType: "appointment",
            linkedObjectId: appt.id,
            payload: { status },
            occurredAt: now,
          });
        }
        return appt;
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
