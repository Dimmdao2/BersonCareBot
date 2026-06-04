import { and, asc, eq, gte, inArray, lte, ne, or, sql, isNull } from "drizzle-orm";
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
import { systemSettings } from "../../../db/schema/schema";
import { buildSlotsForContext } from "@/modules/booking-scheduling/service";
import {
  legacyBranchServiceIdBySsaFromMappings,
  legacyBranchServiceIdForSsaId,
  pickPreferredSsaId,
} from "@/modules/booking-scheduling/ssaResolve";
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

    async resolveLegacyBranchServiceId({ organizationId, branchId, serviceId, specialistId }) {
      const db = getDrizzle();
      const ssaConds = [
        eq(beSpecialistServiceAvailability.organizationId, organizationId),
        eq(beSpecialistServiceAvailability.branchId, branchId),
        eq(beSpecialistServiceAvailability.serviceId, serviceId),
        eq(beSpecialistServiceAvailability.isActive, true),
      ];
      if (specialistId) {
        ssaConds.push(eq(beSpecialistServiceAvailability.specialistId, specialistId));
      }
      const ssaRows = await db
        .select({
          id: beSpecialistServiceAvailability.id,
          createdAt: beSpecialistServiceAvailability.createdAt,
        })
        .from(beSpecialistServiceAvailability)
        .where(and(...ssaConds));
      if (ssaRows.length === 0) return null;

      const mapRows = await db
        .select({
          canonicalId: beExternalEntityMappings.canonicalId,
          metadata: beExternalEntityMappings.metadata,
        })
        .from(beExternalEntityMappings)
        .where(
          and(
            eq(beExternalEntityMappings.organizationId, organizationId),
            eq(beExternalEntityMappings.entityType, "availability"),
            inArray(
              beExternalEntityMappings.canonicalId,
              ssaRows.map((r) => r.id),
            ),
          ),
        );
      const legacyBySsa = legacyBranchServiceIdBySsaFromMappings(mapRows);
      const pickedId = pickPreferredSsaId(
        ssaRows.map((r) => ({ id: r.id, createdAt: r.createdAt, isActive: true })),
        legacyBySsa,
      );
      return legacyBranchServiceIdForSsaId(pickedId, legacyBySsa);
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

    async listBusyIntervals({ organizationId, specialistId, roomId, rangeStart, rangeEnd, excludeAppointmentId }) {
      const db = getDrizzle();
      const apptConds = [
        eq(beAppointments.organizationId, organizationId),
        specialistId ? eq(beAppointments.specialistId, specialistId) : sql`true`,
        gte(beAppointments.endAt, rangeStart),
        lte(beAppointments.startAt, rangeEnd),
        inArray(beAppointments.status, ACTIVE_APPOINTMENT_STATUSES),
      ];
      if (excludeAppointmentId) {
        apptConds.push(ne(beAppointments.id, excludeAppointmentId));
      }
      const apptRows = await db
        .select({ startAt: beAppointments.startAt, endAt: beAppointments.endAt })
        .from(beAppointments)
        .where(and(...apptConds));

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

    async upsertBufferMinutes({ organizationId, specialistId, minutes }) {
      const db = getDrizzle();
      const safeMinutes = Math.max(0, Math.min(240, Math.round(minutes)));
      const scopeConds = [
        eq(beAvailabilityRules.organizationId, organizationId),
        eq(beAvailabilityRules.ruleType, "buffer_minutes"),
        specialistId ? eq(beAvailabilityRules.specialistId, specialistId) : isNull(beAvailabilityRules.specialistId),
      ];
      const existing = await db
        .select({ id: beAvailabilityRules.id })
        .from(beAvailabilityRules)
        .where(and(...scopeConds))
        .limit(1);
      const now = new Date().toISOString();
      if (existing[0]) {
        await db
          .update(beAvailabilityRules)
          .set({ config: { minutes: safeMinutes }, isActive: true, updatedAt: now })
          .where(eq(beAvailabilityRules.id, existing[0].id));
        return;
      }
      await db.insert(beAvailabilityRules).values({
        organizationId,
        specialistId: specialistId ?? null,
        branchId: null,
        ruleType: "buffer_minutes",
        config: { minutes: safeMinutes },
        isActive: true,
      });
    },

    async getMinNoticeHours(_organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select({ valueJson: systemSettings.valueJson })
        .from(systemSettings)
        .where(and(eq(systemSettings.key, "booking_min_notice_hours"), eq(systemSettings.scope, "admin")))
        .limit(1);
      const raw = rows[0]?.valueJson;
      const inner =
        raw !== null && typeof raw === "object" && "value" in (raw as Record<string, unknown>)
          ? (raw as { value: unknown }).value
          : raw;
      const n =
        typeof inner === "number" && Number.isFinite(inner)
          ? inner
          : typeof inner === "string" && /^\d+$/.test(inner.trim())
            ? Number.parseInt(inner.trim(), 10)
            : 0;
      return Math.max(0, Math.min(168, Math.round(n)));
    },

    async listScheduleBlocks({ organizationId, rangeStart, rangeEnd, specialistId, branchId, roomId }) {
      const db = getDrizzle();
      const scopeConds = [
        eq(beSb.organizationId, organizationId),
        gte(beSb.endAt, rangeStart),
        lte(beSb.startAt, rangeEnd),
      ];
      if (specialistId) {
        scopeConds.push(or(eq(beSb.specialistId, specialistId), isNull(beSb.specialistId))!);
      }
      if (branchId) {
        scopeConds.push(or(eq(beSb.branchId, branchId), isNull(beSb.branchId))!);
      }
      if (roomId) {
        scopeConds.push(or(eq(beSb.roomId, roomId), isNull(beSb.roomId))!);
      }
      const rows = await db
        .select()
        .from(beSb)
        .where(and(...scopeConds))
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

    async listWorkingHoursAdmin({ organizationId, specialistId, branchId, roomId }) {
      const db = getDrizzle();
      const conds = [eq(beWh.organizationId, organizationId)];
      if (specialistId === null) conds.push(isNull(beWh.specialistId));
      else if (specialistId) conds.push(eq(beWh.specialistId, specialistId));
      if (branchId === null) conds.push(isNull(beWh.branchId));
      else if (branchId) conds.push(eq(beWh.branchId, branchId));
      if (roomId === null) conds.push(isNull(beWh.roomId));
      else if (roomId) conds.push(eq(beWh.roomId, roomId));
      const rows = await db
        .select()
        .from(beWh)
        .where(and(...conds))
        .orderBy(asc(beWh.weekday), asc(beWh.startMinute));
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        branchId: row.branchId,
        roomId: row.roomId,
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        isActive: row.isActive,
      }));
    },

    async createWorkingHours(input) {
      const db = getDrizzle();
      const inserted = await db
        .insert(beWh)
        .values({
          organizationId: input.organizationId,
          specialistId: input.specialistId ?? null,
          branchId: input.branchId ?? null,
          roomId: input.roomId ?? null,
          weekday: input.weekday,
          startMinute: input.startMinute,
          endMinute: input.endMinute,
          isActive: true,
        })
        .returning();
      const row = inserted[0]!;
      return {
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        branchId: row.branchId,
        roomId: row.roomId,
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        isActive: row.isActive,
      };
    },

    async updateWorkingHours(input) {
      const db = getDrizzle();
      const patch: Partial<typeof beWh.$inferInsert> = { updatedAt: new Date().toISOString() };
      if (input.weekday != null) patch.weekday = input.weekday;
      if (input.startMinute != null) patch.startMinute = input.startMinute;
      if (input.endMinute != null) patch.endMinute = input.endMinute;
      if (input.isActive != null) patch.isActive = input.isActive;
      const updated = await db
        .update(beWh)
        .set(patch)
        .where(and(eq(beWh.id, input.id), eq(beWh.organizationId, input.organizationId)))
        .returning();
      const row = updated[0];
      if (!row) throw new Error("working_hours_not_found");
      return {
        id: row.id,
        organizationId: row.organizationId,
        specialistId: row.specialistId,
        branchId: row.branchId,
        roomId: row.roomId,
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        isActive: row.isActive,
      };
    },

    async deactivateWorkingHours(organizationId, id) {
      const db = getDrizzle();
      await db
        .update(beWh)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(and(eq(beWh.id, id), eq(beWh.organizationId, organizationId)));
    },
  };
}
