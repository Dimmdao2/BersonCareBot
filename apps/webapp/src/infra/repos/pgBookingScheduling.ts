import { and, asc, eq, gte, inArray, lte, or, sql, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beAppointments,
  beBranches,
  beClinicServices,
  beExternalEntityMappings,
  beServiceLocationAvailability,
  beSpecialistServiceAvailability,
} from "../../../db/schema/bookingEngine";
import {
  beAvailabilityRules,
  beWorkingHours as beWh,
  beScheduleBlocks as beSb,
} from "../../../db/schema/bookingScheduling";
import { buildSlotsForContext } from "@/modules/booking-scheduling/service";
import type { BookingSchedulingPort, CanonicalBookingContext } from "@/modules/booking-scheduling/ports";

const ACTIVE_APPOINTMENT_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "confirmed",
  "rescheduled",
  "manual_review_required",
];

export function createPgBookingSchedulingPort(getDefaultOrgId: () => Promise<string>): BookingSchedulingPort {
  return {
    async resolveCanonicalFromBranchService(branchServiceId) {
      const db = getDrizzle();
      const orgId = await getDefaultOrgId();
      const mapRows = await db
        .select({ canonicalId: beExternalEntityMappings.canonicalId })
        .from(beExternalEntityMappings)
        .where(
          and(
            eq(beExternalEntityMappings.organizationId, orgId),
            eq(beExternalEntityMappings.entityType, "availability"),
            sql`${beExternalEntityMappings.metadata}->>'legacy_branch_service_id' = ${branchServiceId}`,
          ),
        )
        .limit(1);
      const ssaId = mapRows[0]?.canonicalId;
      if (!ssaId) return null;

      const ssaRows = await db
        .select()
        .from(beSpecialistServiceAvailability)
        .where(eq(beSpecialistServiceAvailability.id, ssaId))
        .limit(1);
      const ssa = ssaRows[0];
      if (!ssa?.branchId) return null;

      const branchRows = await db.select().from(beBranches).where(eq(beBranches.id, ssa.branchId)).limit(1);
      const branch = branchRows[0];
      if (!branch) return null;

      const serviceRows = await db.select().from(beClinicServices).where(eq(beClinicServices.id, ssa.serviceId)).limit(1);
      const service = serviceRows[0];
      if (!service) return null;

      const durationMinutes = ssa.durationMinutesOverride ?? service.durationMinutes;

      return {
        organizationId: orgId,
        branchId: ssa.branchId,
        specialistId: ssa.specialistId,
        serviceId: ssa.serviceId,
        roomId: ssa.roomId ?? null,
        branchServiceId,
        durationMinutes,
        branchTimezone: branch.timezone,
      } satisfies CanonicalBookingContext;
    },

    async listServicesByCityCode(organizationId, cityCode) {
      const db = getDrizzle();
      const rows = await db
        .select({
          serviceId: beServiceLocationAvailability.serviceId,
          branchId: beServiceLocationAvailability.branchId,
        })
        .from(beServiceLocationAvailability)
        .innerJoin(beBranches, eq(beBranches.id, beServiceLocationAvailability.branchId))
        .where(
          and(
            eq(beServiceLocationAvailability.organizationId, organizationId),
            eq(beServiceLocationAvailability.isActive, true),
            eq(beBranches.cityCode, cityCode),
            eq(beBranches.isActive, true),
          ),
        );
      return rows;
    },

    async getSlots(context) {
      return buildSlotsForContext(this, context);
    },

    async listBusyIntervals({ organizationId, specialistId, roomId, rangeStart, rangeEnd }) {
      const db = getDrizzle();
      const apptRows = await db
        .select({ startAt: beAppointments.startAt, endAt: beAppointments.endAt })
        .from(beAppointments)
        .where(
          and(
            eq(beAppointments.organizationId, organizationId),
            specialistId ? eq(beAppointments.specialistId, specialistId) : sql`true`,
            gte(beAppointments.endAt, rangeStart),
            lte(beAppointments.startAt, rangeEnd),
            inArray(beAppointments.status, ACTIVE_APPOINTMENT_STATUSES),
          ),
        );

      const blockConds = [
        eq(beSb.organizationId, organizationId),
        gte(beSb.endAt, rangeStart),
        lte(beSb.startAt, rangeEnd),
      ];
      if (specialistId) blockConds.push(or(eq(beSb.specialistId, specialistId), isNull(beSb.specialistId))!);
      const blockRows = await db
        .select({ startAt: beSb.startAt, endAt: beSb.endAt })
        .from(beSb)
        .where(and(...blockConds));

      return [...apptRows, ...blockRows];
    },

    async listWorkingHours({ organizationId, specialistId, branchId, roomId }) {
      const db = getDrizzle();
      const rows = await db
        .select({
          weekday: beWh.weekday,
          startMinute: beWh.startMinute,
          endMinute: beWh.endMinute,
        })
        .from(beWh)
        .where(
          and(
            eq(beWh.organizationId, organizationId),
            eq(beWh.isActive, true),
            specialistId
              ? or(eq(beWh.specialistId, specialistId), isNull(beWh.specialistId))
              : isNull(beWh.specialistId),
            branchId ? or(eq(beWh.branchId, branchId), isNull(beWh.branchId)) : isNull(beWh.branchId),
            roomId ? or(eq(beWh.roomId, roomId), isNull(beWh.roomId)) : isNull(beWh.roomId),
          ),
        );
      if (rows.length > 0) return rows;
      const orgRows = await db
        .select({
          weekday: beWh.weekday,
          startMinute: beWh.startMinute,
          endMinute: beWh.endMinute,
        })
        .from(beWh)
        .where(
          and(
            eq(beWh.organizationId, organizationId),
            eq(beWh.isActive, true),
            isNull(beWh.specialistId),
            isNull(beWh.branchId),
            isNull(beWh.roomId),
          ),
        );
      return orgRows;
    },

    async getBufferMinutes(organizationId, specialistId) {
      const db = getDrizzle();
      const rows = await db
        .select({ config: beAvailabilityRules.config })
        .from(beAvailabilityRules)
        .where(
          and(
            eq(beAvailabilityRules.organizationId, organizationId),
            eq(beAvailabilityRules.ruleType, "buffer_minutes"),
            eq(beAvailabilityRules.isActive, true),
            specialistId
              ? or(eq(beAvailabilityRules.specialistId, specialistId), isNull(beAvailabilityRules.specialistId))
              : isNull(beAvailabilityRules.specialistId),
          ),
        )
        .limit(1);
      const cfg = rows[0]?.config;
      const minutes = cfg && typeof cfg.minutes === "number" ? cfg.minutes : 0;
      return Math.max(0, Math.round(minutes));
    },

    async listScheduleBlocks({ organizationId, rangeStart, rangeEnd }) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSb)
        .where(
          and(
            eq(beSb.organizationId, organizationId),
            gte(beSb.endAt, rangeStart),
            lte(beSb.startAt, rangeEnd),
          ),
        )
        .orderBy(asc(beSb.startAt));
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        branchId: row.branchId,
        roomId: row.roomId,
        startAt: row.startAt,
        endAt: row.endAt,
        blockType: row.blockType,
        title: row.title,
      }));
    },

    async createScheduleBlock(input) {
      const db = getDrizzle();
      const inserted = await db
        .insert(beSb)
        .values({
          organizationId: input.organizationId,
          specialistId: input.specialistId ?? null,
          branchId: input.branchId ?? null,
          roomId: input.roomId ?? null,
          startAt: input.startAt,
          endAt: input.endAt,
          blockType: input.blockType,
          title: input.title ?? null,
          createdByActorId: input.createdByActorId ?? null,
        })
        .returning();
      const row = inserted[0]!;
      return {
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        branchId: row.branchId,
        roomId: row.roomId,
        startAt: row.startAt,
        endAt: row.endAt,
        blockType: row.blockType,
        title: row.title,
      };
    },

    async deleteScheduleBlock(organizationId, blockId) {
      const db = getDrizzle();
      await db.delete(beSb).where(and(eq(beSb.id, blockId), eq(beSb.organizationId, organizationId)));
    },
  };
}
