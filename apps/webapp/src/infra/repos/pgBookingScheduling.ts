import { and, asc, eq, gte, inArray, lte, ne, or, sql, isNull } from "drizzle-orm";
import type { BreakInterval } from "@/modules/booking-scheduling/ports";
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
  beWorkingDays as beWd,
  beScheduleTemplates as beStmpl,
} from "../../../db/schema/bookingScheduling";
import { systemSettings } from "../../../db/schema/schema";
import { buildSlotsForContext } from "@/modules/booking-scheduling/service";
import {
  computeNearestFreeWindowFromData,
  localDateKey,
  pickWorkingHours,
  workingIntervalsForDate,
} from "@/modules/booking-scheduling/computeSlots";
import {
  legacyBranchServiceIdBySsaFromMappings,
  legacyBranchServiceIdForSsaId,
  pickPreferredSsaId,
} from "@/modules/booking-scheduling/ssaResolve";
import type {
  BookingSchedulingPort,
  CanonicalBookingContext,
  NearestFreeWindowInput,
  NearestFreeWindowResult,
  WorkingDayRecord,
  ScheduleTemplateRecord,
  UpsertWorkingDaysInput,
  CloseWorkingDaysInput,
  ClearWorkingDaysInput,
  CreateScheduleTemplateInput,
} from "@/modules/booking-scheduling/ports";

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
        // F1b: soft-deleted appointments do not reserve the slot.
        isNull(beAppointments.deletedAt),
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
      // undefined = no scope filter (return rows for all specialists/branches);
      // null     = global-only (IS NULL);
      // string   = specific id OR global (id OR IS NULL).
      // This mirrors the listWorkingDays ternary and fixes the СИМПТОМ-2 root cause:
      // when specialistId is undefined (multi-specialist, no filter selected), all
      // per-specialist working-hours rows are returned instead of only IS-NULL globals.
      const specialistCond =
        specialistId === undefined
          ? undefined
          : specialistId
            ? or(eq(beWh.specialistId, specialistId), isNull(beWh.specialistId))
            : isNull(beWh.specialistId);
      const branchCond =
        branchId === undefined
          ? undefined
          : branchId
            ? or(eq(beWh.branchId, branchId), isNull(beWh.branchId))
            : isNull(beWh.branchId);
      const roomCond =
        roomId === undefined
          ? undefined
          : roomId
            ? or(eq(beWh.roomId, roomId), isNull(beWh.roomId))
            : isNull(beWh.roomId);
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
            specialistCond,
            branchCond,
            roomCond,
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

    async listWorkingHoursAdmin({ organizationId, specialistId, branchId, roomId, weekday }) {
      const db = getDrizzle();
      const conds = [eq(beWh.organizationId, organizationId)];
      if (specialistId === null) conds.push(isNull(beWh.specialistId));
      else if (specialistId) conds.push(eq(beWh.specialistId, specialistId));
      if (branchId === null) conds.push(isNull(beWh.branchId));
      else if (branchId) conds.push(eq(beWh.branchId, branchId));
      if (roomId === null) conds.push(isNull(beWh.roomId));
      else if (roomId) conds.push(eq(beWh.roomId, roomId));
      if (weekday != null) conds.push(eq(beWh.weekday, weekday));
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
      if (input.replace) {
        const deactConds = [
          eq(beWh.organizationId, input.organizationId),
          eq(beWh.weekday, input.weekday),
          eq(beWh.isActive, true),
        ];
        if (input.specialistId === null) deactConds.push(isNull(beWh.specialistId));
        else if (input.specialistId) deactConds.push(eq(beWh.specialistId, input.specialistId));
        if (input.branchId === null) deactConds.push(isNull(beWh.branchId));
        else if (input.branchId) deactConds.push(eq(beWh.branchId, input.branchId));
        const inserted = await db.transaction(async (tx) => {
          await tx.update(beWh).set({ isActive: false, updatedAt: new Date().toISOString() }).where(and(...deactConds));
          return tx
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
        });
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
      }
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

    // ── Per-date working days ────────────────────────────────────────────────

    async listWorkingDays({ organizationId, specialistId, branchId, dateFrom, dateTo }) {
      const db = getDrizzle();
      const baseConds = [
        eq(beWd.organizationId, organizationId),
        gte(beWd.workDate, dateFrom),
        lte(beWd.workDate, dateTo),
      ];
      const specialistCond =
        specialistId === null
          ? isNull(beWd.specialistId)
          : specialistId
            ? eq(beWd.specialistId, specialistId)
            : undefined;
      // Optional branchId filter for E3 grid filter (§13.2)
      const branchCond =
        branchId === null
          ? isNull(beWd.branchId)
          : branchId
            ? eq(beWd.branchId, branchId)
            : undefined;
      const rows = await db
        .select()
        .from(beWd)
        .where(and(...baseConds, specialistCond, branchCond))
        .orderBy(asc(beWd.workDate));
      return rows.map(mapWorkingDayRow);
    },

    async upsertWorkingDays({ organizationId, specialistId, branchId, roomId, dates, startMinute, endMinute, breaks }: Parameters<BookingSchedulingPort["upsertWorkingDays"]>[0]) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const results: WorkingDayRecord[] = [];
      const sentinelId = "00000000-0000-0000-0000-000000000000";
      const effectiveBreaks: BreakInterval[] = breaks ?? [];
      const breaksJson = JSON.stringify(effectiveBreaks);
      for (const workDate of dates) {
        // Use raw SQL for conflict target because the unique index is expression-based (COALESCE)
        const rows = await db.execute<RawWorkingDayRow>(
          sql`INSERT INTO be_working_days
            (organization_id, specialist_id, branch_id, room_id, work_date,
             start_minute, end_minute, breaks, is_closed, updated_at)
          VALUES
            (${organizationId}, ${specialistId ?? null}, ${branchId ?? null}, ${roomId ?? null}, ${workDate},
             ${startMinute}, ${endMinute},
             ${breaksJson}::jsonb, false, ${now})
          ON CONFLICT (organization_id, COALESCE(specialist_id, ${sentinelId}::uuid), work_date)
          DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            room_id = EXCLUDED.room_id,
            start_minute = EXCLUDED.start_minute,
            end_minute = EXCLUDED.end_minute,
            breaks = EXCLUDED.breaks,
            is_closed = false,
            updated_at = EXCLUDED.updated_at
          RETURNING *`,
        );
        const row = rows.rows[0] as RawWorkingDayRow | undefined;
        if (row) results.push(mapRawWorkingDayRow(row));
      }
      return results;
    },

    async closeWorkingDays({ organizationId, specialistId, dates }: Parameters<BookingSchedulingPort["closeWorkingDays"]>[0]) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const results: WorkingDayRecord[] = [];
      const sentinelId = "00000000-0000-0000-0000-000000000000";
      for (const workDate of dates) {
        const rows = await db.execute<RawWorkingDayRow>(
          sql`INSERT INTO be_working_days
            (organization_id, specialist_id, branch_id, room_id, work_date,
             start_minute, end_minute, breaks, is_closed, updated_at)
          VALUES
            (${organizationId}, ${specialistId ?? null}, NULL, NULL, ${workDate},
             NULL, NULL, '[]'::jsonb, true, ${now})
          ON CONFLICT (organization_id, COALESCE(specialist_id, ${sentinelId}::uuid), work_date)
          DO UPDATE SET
            start_minute = NULL,
            end_minute = NULL,
            breaks = '[]'::jsonb,
            is_closed = true,
            updated_at = EXCLUDED.updated_at
          RETURNING *`,
        );
        const row = rows.rows[0] as RawWorkingDayRow | undefined;
        if (row) results.push(mapRawWorkingDayRow(row));
      }
      return results;
    },

    async clearWorkingDays({ organizationId, specialistId, dates }: Parameters<BookingSchedulingPort["clearWorkingDays"]>[0]) {
      const db = getDrizzle();
      const baseConds = [
        eq(beWd.organizationId, organizationId),
        inArray(beWd.workDate, dates),
      ];
      const specialistCond =
        specialistId === null
          ? isNull(beWd.specialistId)
          : specialistId
            ? eq(beWd.specialistId, specialistId)
            : undefined;
      await db.delete(beWd).where(and(...baseConds, specialistCond));
    },

    // ── Schedule templates ───────────────────────────────────────────────────

    async listScheduleTemplates(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beStmpl)
        .where(and(eq(beStmpl.organizationId, organizationId), eq(beStmpl.isActive, true)))
        .orderBy(asc(beStmpl.sortOrder), asc(beStmpl.name));
      return rows.map(mapTemplateRow);
    },

    async createScheduleTemplate({ organizationId, branchId, name, startMinute, endMinute, breaks, sortOrder }: CreateScheduleTemplateInput) {
      const db = getDrizzle();
      const inserted = await db
        .insert(beStmpl)
        .values({
          organizationId,
          branchId: branchId ?? null,
          name,
          startMinute,
          endMinute,
          breaks: breaks ?? [],
          sortOrder: sortOrder ?? 0,
          isActive: true,
        })
        .returning();
      return mapTemplateRow(inserted[0]!);
    },

    async deleteScheduleTemplate(organizationId, id) {
      const db = getDrizzle();
      await db
        .update(beStmpl)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(and(eq(beStmpl.id, id), eq(beStmpl.organizationId, organizationId)));
    },

    // ── Nearest free window (C3) ─────────────────────────────────────────────

    async nearestFreeWindow({ organizationId, specialistId, branchId, roomId, timeZone, nowOverride }) {
      const now = nowOverride ?? new Date();
      const nowMs = now.getTime();
      const todayKey = localDateKey(now.toISOString(), timeZone);

      // Рабочие часы weekday-модели
      const workingHoursRaw = await this.listWorkingHours({ organizationId, specialistId, branchId, roomId });
      const workingHoursRows = workingHoursRaw.map((r) => ({
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      }));

      // Per-date override
      const perDayRows = await this.listWorkingDays({
        organizationId,
        specialistId,
        dateFrom: todayKey,
        dateTo: todayKey,
      });
      const perDayRow = perDayRows.find((r) => r.workDate === todayKey);

      // Branch-scoping (инвариант из computeSlotsInternal)
      const effectivePerDayRow =
        perDayRow &&
        perDayRow.branchId != null &&
        branchId != null &&
        perDayRow.branchId !== branchId
          ? { ...perDayRow, isClosed: true }
          : perDayRow;

      // Рабочие интервалы для определения границ дня
      const effectiveHours = pickWorkingHours(workingHoursRows);
      const dayIntervals = workingIntervalsForDate(todayKey, timeZone, effectiveHours, 0, effectivePerDayRow);
      if (dayIntervals.length === 0) return null;

      const dayStartMs = dayIntervals[0]!.startMs;
      const dayEndMs = dayIntervals[dayIntervals.length - 1]!.endMs;

      const busy = await this.listBusyIntervals({
        organizationId,
        specialistId,
        roomId,
        rangeStart: new Date(dayStartMs).toISOString(),
        rangeEnd: new Date(dayEndMs).toISOString(),
      });

      return computeNearestFreeWindowFromData(
        todayKey,
        timeZone,
        workingHoursRows,
        effectivePerDayRow,
        busy,
        nowMs,
      );
    },
  };
}

// ── Row mappers ──────────────────────────────────────────────────────────────

/**
 * Resolve effective breaks for a working day or template.
 * Sole source: `breaks` jsonb column (migration 0116; legacy scalars dropped in 0118).
 */
function resolveBreaks(
  breaks: Array<{ startMinute: number; endMinute: number }> | null | undefined,
): BreakInterval[] {
  return breaks ?? [];
}

export function mapWorkingDayRow(row: typeof beWd.$inferSelect): WorkingDayRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    specialistId: row.specialistId,
    branchId: row.branchId,
    roomId: row.roomId,
    workDate: row.workDate,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    breaks: resolveBreaks(row.breaks),
    isClosed: row.isClosed,
  };
}

/**
 * Маппер для строк из raw `db.execute(... RETURNING *)`: драйвер отдаёт ключи в snake_case
 * (имена колонок БД), а не camelCase Drizzle-инференса, поэтому читаем по фактическим именам.
 */
export type RawWorkingDayRow = {
  id: string;
  organization_id: string;
  specialist_id: string | null;
  branch_id: string | null;
  room_id: string | null;
  work_date: string;
  start_minute: number | null;
  end_minute: number | null;
  breaks: Array<{ startMinute: number; endMinute: number }> | null;
  is_closed: boolean;
};

export function mapRawWorkingDayRow(row: RawWorkingDayRow): WorkingDayRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    specialistId: row.specialist_id,
    branchId: row.branch_id,
    roomId: row.room_id,
    workDate: row.work_date,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    breaks: resolveBreaks(row.breaks),
    isClosed: row.is_closed,
  };
}

function mapTemplateRow(row: typeof beStmpl.$inferSelect): ScheduleTemplateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    name: row.name,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    breaks: resolveBreaks(row.breaks),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
