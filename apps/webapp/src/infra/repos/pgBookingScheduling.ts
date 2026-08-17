import { and, asc, eq, gte, inArray, lte, ne, or, sql, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { BreakInterval } from '@/modules/booking-scheduling/ports';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import { getServerRuntimeInteger } from '@/modules/system-settings/configAdapter';
import {
  beAppointments,
  beBranches,
  beClinicServices,
  beServiceLocationAvailability,
  beSpecialists,
  beSpecialistServiceAvailability,
} from '../../../db/schema/bookingEngine';
import {
  beAvailabilityRules,
  beWorkingHours as beWh,
  beScheduleBlocks as beSb,
  beWorkingDays as beWd,
  beScheduleTemplates as beStmpl,
} from '../../../db/schema/bookingScheduling';
import { buildSlotsForContext, computeSlotsFromData } from '@/modules/booking-scheduling/service';
import {
  computeNearestFreeWindowFromData,
  localDateKey,
  pickWorkingHours,
  workingIntervalsForDate,
  type BusyInterval,
} from '@/modules/booking-scheduling/computeSlots';
import { pickPreferredSsaId } from '@/modules/booking-scheduling/ssaResolve';
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
} from '@/modules/booking-scheduling/ports';

const ACTIVE_APPOINTMENT_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'confirmed',
  'rescheduled',
  'manual_review_required',
];

const patientBookingContextSchema = z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid(),
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  roomId: z.string().uuid().nullable(),
  durationMinutes: z.number().int().positive(),
  bufferAfterMinutes: z.number().int().nonnegative(),
  branchTimezone: z.string().min(1),
  patientCatalogSnapshot: z.object({
    branchTitle: z.string().min(1),
    branchShortTitle: z.string().nullable(),
    branchColor: z.string().nullable(),
    branchCityCode: z.string().min(1),
    branchAddress: z.string().nullable(),
    branchSortOrder: z.number().int(),
    serviceTitle: z.string().min(1),
    serviceDescription: z.string().nullable(),
    servicePriceMinor: z.number().int().nonnegative(),
    servicePrepaymentApplicable: z.boolean(),
    serviceUsableInPackages: z.boolean(),
    serviceOnlinePaymentApplicable: z.boolean(),
    servicePublicWidgetVisible: z.boolean(),
    serviceAdminManualOnly: z.boolean(),
    serviceSortOrder: z.number().int(),
    specialistReminderAllowedPresetIds: z.array(
      z.enum(['day_and_two_hours', 'day_before', 'two_hours_before']),
    ),
    specialistReminderDefaultPresetId: z
      .enum(['day_and_two_hours', 'day_before', 'two_hours_before'])
      .nullable(),
  }).optional(),
});

const patientBookingSlotSnapshotSchema = z.object({
  context: patientBookingContextSchema,
  workingHours: z.array(
    z.object({
      weekday: z.number().int(),
      startMinute: z.number().int(),
      endMinute: z.number().int(),
    }),
  ),
  workingDays: z.array(
    z.object({
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
      specialistId: z.string().uuid().nullable(),
      branchId: z.string().uuid().nullable(),
      roomId: z.string().uuid().nullable(),
      workDate: z.string(),
      startMinute: z.number().int().nullable(),
      endMinute: z.number().int().nullable(),
      breaks: z.array(z.object({ startMinute: z.number().int(), endMinute: z.number().int() })),
      isClosed: z.boolean(),
    }),
  ),
  busy: z.array(z.object({ startAt: z.string(), endAt: z.string() })),
  bufferMinutes: z.number().int().nonnegative(),
  minNoticeHours: z.number().int().min(0).max(168),
  maxConsecutiveSlotHours: z.number().int().min(1).max(24),
});

function isCurrentPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

async function readCurrentPatientBookingSlotSnapshot(input: {
  branchId: string;
  serviceId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const result = await runWebappNamedRoot<{ snapshot: unknown }>(
    getWebappSqlDb(),
    'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)',
    [input.branchId, input.serviceId, input.dateFrom, input.dateTo],
    sql`SELECT app.read_current_patient_booking_creation_snapshot(
      ${input.branchId}::uuid,
      ${input.serviceId}::uuid,
      ${input.dateFrom}::text,
      ${input.dateTo}::text
    ) AS snapshot`,
  );
  const snapshot = result.rows[0]?.snapshot;
  return snapshot == null ? null : patientBookingSlotSnapshotSchema.parse(snapshot);
}

async function readCurrentPatientBookingRuntimeInteger(
  key: 'booking_min_notice_hours' | 'booking_max_consecutive_slot_hours',
): Promise<number> {
  const result = await runWebappNamedRoot<{ value: number | null }>(
    getWebappSqlDb(),
    'app.read_current_patient_booking_runtime_integer(text)',
    [key],
    sql`SELECT app.read_current_patient_booking_runtime_integer(${key}) AS value`,
  );
  const value = result.rows[0]?.value;
  if (value == null) throw new Error('catalog_unavailable');
  return value;
}

export type BookingBusyIntervalsInput = {
  organizationId: string;
  specialistId: string | null;
  roomId: string | null;
  rangeStart: string;
  rangeEnd: string;
  excludeAppointmentId?: string;
};

async function resolveCanonicalAvailabilityContext(
  availabilityId: string,
): Promise<CanonicalBookingContext | null> {
  const db = getDrizzle();
  const ssaRows = await db
    .select()
    .from(beSpecialistServiceAvailability)
    .where(
      and(
        eq(beSpecialistServiceAvailability.id, availabilityId),
        eq(beSpecialistServiceAvailability.isActive, true),
      ),
    )
    .limit(1);
  const ssa = ssaRows[0];
  if (!ssa?.branchId) return null;

  const specialistRows = await db
    .select({ id: beSpecialists.id })
    .from(beSpecialists)
    .where(
      and(
        eq(beSpecialists.id, ssa.specialistId),
        eq(beSpecialists.organizationId, ssa.organizationId),
        eq(beSpecialists.isActive, true),
      ),
    )
    .limit(1);
  if (!specialistRows[0]) return null;

  const branchRows = await db
    .select()
    .from(beBranches)
    .where(
      and(
        eq(beBranches.id, ssa.branchId),
        eq(beBranches.organizationId, ssa.organizationId),
        eq(beBranches.isActive, true),
      ),
    )
    .limit(1);
  const branch = branchRows[0];
  if (!branch) return null;

  const serviceRows = await db
    .select()
    .from(beClinicServices)
    .where(
      and(
        eq(beClinicServices.id, ssa.serviceId),
        eq(beClinicServices.organizationId, ssa.organizationId),
        eq(beClinicServices.isActive, true),
      ),
    )
    .limit(1);
  const service = serviceRows[0];
  if (!service) return null;

  return {
    organizationId: ssa.organizationId,
    branchId: ssa.branchId,
    specialistId: ssa.specialistId,
    serviceId: ssa.serviceId,
    roomId: ssa.roomId ?? null,
    durationMinutes: service.durationMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    branchTimezone: branch.timezone,
  } satisfies CanonicalBookingContext;
}

/** Shared by availability reads and the transaction-locked online writer. */
export async function listBookingBusyIntervals(
  db: DrizzleDb,
  {
    organizationId,
    specialistId,
    rangeStart,
    rangeEnd,
    excludeAppointmentId,
  }: BookingBusyIntervalsInput,
): Promise<BusyInterval[]> {
  const apptConds = [
    eq(beAppointments.organizationId, organizationId),
    specialistId ? eq(beAppointments.specialistId, specialistId) : sql`true`,
    isNull(beAppointments.deletedAt),
    sql`(${beAppointments.endAt} + (COALESCE(${beClinicServices.bufferAfterMinutes}, 0) * interval '1 minute')) >= ${rangeStart}`,
    lte(beAppointments.startAt, rangeEnd),
    inArray(beAppointments.status, ACTIVE_APPOINTMENT_STATUSES),
  ];
  if (excludeAppointmentId) apptConds.push(ne(beAppointments.id, excludeAppointmentId));
  const apptRows = await db
    .select({
      startAt: beAppointments.startAt,
      endAt: sql<string>`(${beAppointments.endAt} + (COALESCE(${beClinicServices.bufferAfterMinutes}, 0) * interval '1 minute'))`,
    })
    .from(beAppointments)
    .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
    .where(and(...apptConds));

  const blockConds = [
    eq(beSb.organizationId, organizationId),
    gte(beSb.endAt, rangeStart),
    lte(beSb.startAt, rangeEnd),
  ];
  if (specialistId)
    blockConds.push(or(eq(beSb.specialistId, specialistId), isNull(beSb.specialistId))!);
  const blockRows = await db
    .select({ startAt: beSb.startAt, endAt: beSb.endAt })
    .from(beSb)
    .where(and(...blockConds));
  return [...apptRows, ...blockRows];
}

export function createPgBookingSchedulingPort(
  _getDefaultOrgId?: () => Promise<string>,
): BookingSchedulingPort {
  return {
    async resolvePublicBookingOrganization({ branchId, serviceId }) {
      const result = await runWebappPgText<{ organization_id: string | null }>(
        `SELECT app.resolve_public_booking_organization(
           $1::uuid,
           $2::uuid,
           $3::uuid
         )::text AS organization_id`,
        [branchId?.trim() || null, serviceId?.trim() || null, null],
      );
      return result.rows[0]?.organization_id ?? null;
    },

    async resolveCanonicalInPersonContext({ organizationId, branchId, serviceId }) {
      if (isCurrentPatientPrincipal()) {
        const today = new Date().toISOString().slice(0, 10);
        const snapshot = await readCurrentPatientBookingSlotSnapshot({
          branchId,
          serviceId,
          dateFrom: today,
          dateTo: today,
        });
        if (!snapshot) return null;
        if (organizationId && snapshot.context.organizationId !== organizationId) {
          throw new Error('ambiguous_booking_tenant');
        }
        return snapshot.context;
      }
      const db = getDrizzle();
      const conditions = [
        eq(beSpecialistServiceAvailability.branchId, branchId),
        eq(beSpecialistServiceAvailability.serviceId, serviceId),
        eq(beSpecialistServiceAvailability.isActive, true),
      ];
      if (organizationId) {
        conditions.push(eq(beSpecialistServiceAvailability.organizationId, organizationId));
      }
      const rows = await db
        .select({
          id: beSpecialistServiceAvailability.id,
          organizationId: beSpecialistServiceAvailability.organizationId,
          createdAt: beSpecialistServiceAvailability.createdAt,
        })
        .from(beSpecialistServiceAvailability)
        .innerJoin(
          beSpecialists,
          and(
            eq(beSpecialists.id, beSpecialistServiceAvailability.specialistId),
            eq(beSpecialists.organizationId, beSpecialistServiceAvailability.organizationId),
            eq(beSpecialists.isActive, true),
          ),
        )
        .where(and(...conditions));
      if (rows.length === 0) return null;
      const organizations = new Set(rows.map((row) => row.organizationId));
      if (organizations.size !== 1) throw new Error('ambiguous_booking_tenant');
      const availabilityId = pickPreferredSsaId(
        rows.map((row) => ({ id: row.id, createdAt: row.createdAt, isActive: true })),
      );
      if (!availabilityId) return null;
      return resolveCanonicalAvailabilityContext(availabilityId);
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
        .innerJoin(
          beSpecialists,
          and(
            eq(beSpecialists.id, beSpecialistServiceAvailability.specialistId),
            eq(beSpecialists.organizationId, organizationId),
            eq(beSpecialists.isActive, true),
          ),
        )
        .where(and(...ssaConds));
      if (ssaRows.length === 0) return null;

      const pickedId = pickPreferredSsaId(
        ssaRows.map((r) => ({ id: r.id, createdAt: r.createdAt, isActive: true })),
      );
      return pickedId;
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
      if (isCurrentPatientPrincipal()) {
        if (!context.branchId || !context.serviceId) {
          throw new Error('branch_service_not_found');
        }
        const snapshot = await readCurrentPatientBookingSlotSnapshot({
          branchId: context.branchId,
          serviceId: context.serviceId,
          dateFrom: context.dateFrom,
          dateTo: context.dateTo,
        });
        if (!snapshot) throw new Error('branch_service_not_found');
        if (
          snapshot.context.organizationId !== context.organizationId ||
          snapshot.context.specialistId !== context.specialistId
        ) {
          throw new Error('ambiguous_booking_tenant');
        }
        return computeSlotsFromData(context, {
          workingHours: snapshot.workingHours,
          workingDays: snapshot.workingDays,
          busy: snapshot.busy,
          bufferMinutes: snapshot.bufferMinutes,
          minNoticeHours: snapshot.minNoticeHours,
        });
      }
      return buildSlotsForContext(this, context);
    },

    async listBusyIntervals({
      organizationId,
      specialistId,
      roomId,
      rangeStart,
      rangeEnd,
      excludeAppointmentId,
    }) {
      if (isCurrentPatientPrincipal()) {
        if (!specialistId) return [];
        const result = await runWebappNamedRoot<{ start_at: string; end_at: string }>(
          getWebappSqlDb(),
          'app.read_current_patient_booking_busy_intervals(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid)',
          [specialistId, roomId, rangeStart, rangeEnd, excludeAppointmentId ?? null],
          sql`SELECT start_at, end_at
              FROM app.read_current_patient_booking_busy_intervals(
                ${specialistId}::uuid,
                ${roomId}::uuid,
                ${rangeStart}::timestamptz,
                ${rangeEnd}::timestamptz,
                ${excludeAppointmentId ?? null}::uuid
              )`,
        );
        return result.rows.map((row) => ({ startAt: row.start_at, endAt: row.end_at }));
      }
      const db = getDrizzle();
      return listBookingBusyIntervals(db, {
        organizationId,
        specialistId,
        roomId,
        rangeStart,
        rangeEnd,
        ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
      });
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
            eq(beAvailabilityRules.ruleType, 'buffer_minutes'),
            eq(beAvailabilityRules.isActive, true),
            specialistId
              ? or(
                  eq(beAvailabilityRules.specialistId, specialistId),
                  isNull(beAvailabilityRules.specialistId),
                )
              : isNull(beAvailabilityRules.specialistId),
          ),
        )
        .limit(1);
      const cfg = rows[0]?.config;
      const minutes = cfg && typeof cfg.minutes === 'number' ? cfg.minutes : 0;
      return Math.max(0, Math.round(minutes));
    },

    async upsertBufferMinutes({ organizationId, specialistId, minutes }) {
      const safeMinutes = Math.max(0, Math.min(240, Math.round(minutes)));
      const scopeConds = [
        eq(beAvailabilityRules.organizationId, organizationId),
        eq(beAvailabilityRules.ruleType, 'buffer_minutes'),
        specialistId
          ? eq(beAvailabilityRules.specialistId, specialistId)
          : isNull(beAvailabilityRules.specialistId),
      ];
      const now = new Date().toISOString();
      await runWebappTransaction(async (tx) => {
        const existing = await tx
          .select({ id: beAvailabilityRules.id })
          .from(beAvailabilityRules)
          .where(and(...scopeConds))
          .limit(1);
        if (existing[0]) {
          await tx
            .update(beAvailabilityRules)
            .set({ config: { minutes: safeMinutes }, isActive: true, updatedAt: now })
            .where(eq(beAvailabilityRules.id, existing[0].id));
          return;
        }
        await tx.insert(beAvailabilityRules).values({
          organizationId,
          specialistId: specialistId ?? null,
          branchId: null,
          ruleType: 'buffer_minutes',
          config: { minutes: safeMinutes },
          isActive: true,
        });
      });
    },

    async getMinNoticeHours(organizationId) {
      if (isCurrentPatientPrincipal()) {
        return readCurrentPatientBookingRuntimeInteger('booking_min_notice_hours');
      }
      return getServerRuntimeInteger('booking_min_notice_hours', organizationId);
    },

    async getMaxConsecutiveSlotHours(organizationId) {
      if (isCurrentPatientPrincipal()) {
        return readCurrentPatientBookingRuntimeInteger('booking_max_consecutive_slot_hours');
      }
      return getServerRuntimeInteger('booking_max_consecutive_slot_hours', organizationId);
    },

    async listScheduleBlocks({
      organizationId,
      rangeStart,
      rangeEnd,
      specialistId,
      branchId,
      roomId,
    }) {
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
      const inserted = await db.transaction((tx) =>
        tx
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
          .returning(),
      );
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
      await db.transaction((tx) =>
        tx.delete(beSb).where(and(eq(beSb.id, blockId), eq(beSb.organizationId, organizationId))),
      );
    },

    async listWorkingHoursAdmin({ organizationId, specialistId, branchId, roomId, weekday }) {
      const db = getDrizzle();
      const conds = [eq(beWh.organizationId, organizationId)];
      // null  = global-only (IS NULL); string = own specialist rows OR global (IS NULL) rows.
      // The OR-IS-NULL fallback mirrors listWorkingHours so the schedule editor and
      // the calendar show the same rows: a specialist-scoped query must also surface
      // global (specialist_id IS NULL) org-level rows that act as the default schedule.
      if (specialistId === null) conds.push(isNull(beWh.specialistId));
      else if (specialistId)
        conds.push(or(eq(beWh.specialistId, specialistId), isNull(beWh.specialistId))!);
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
      const inserted = await db.transaction(async (tx) => {
        if (input.replace) {
          if (input.specialistId === undefined) {
            throw new Error('replace=true requires specialistId for scope safety');
          }
          const deactConds = [
            eq(beWh.organizationId, input.organizationId),
            eq(beWh.weekday, input.weekday),
            eq(beWh.isActive, true),
          ];
          if (input.specialistId === null) deactConds.push(isNull(beWh.specialistId));
          else deactConds.push(eq(beWh.specialistId, input.specialistId));
          if (input.branchId === null) deactConds.push(isNull(beWh.branchId));
          else if (input.branchId) deactConds.push(eq(beWh.branchId, input.branchId));
          await tx
            .update(beWh)
            .set({ isActive: false, updatedAt: new Date().toISOString() })
            .where(and(...deactConds));
        }
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
    },

    async updateWorkingHours(input) {
      const db = getDrizzle();
      const patch: Partial<typeof beWh.$inferInsert> = { updatedAt: new Date().toISOString() };
      if (input.weekday != null) patch.weekday = input.weekday;
      if (input.startMinute != null) patch.startMinute = input.startMinute;
      if (input.endMinute != null) patch.endMinute = input.endMinute;
      if (input.isActive != null) patch.isActive = input.isActive;
      const updated = await db.transaction((tx) =>
        tx
          .update(beWh)
          .set(patch)
          .where(and(eq(beWh.id, input.id), eq(beWh.organizationId, input.organizationId)))
          .returning(),
      );
      const row = updated[0];
      if (!row) throw new Error('working_hours_not_found');
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
      await db.transaction((tx) =>
        tx
          .update(beWh)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(and(eq(beWh.id, id), eq(beWh.organizationId, organizationId))),
      );
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

    async upsertWorkingDays({
      organizationId,
      specialistId,
      branchId,
      roomId,
      dates,
      startMinute,
      endMinute,
      breaks,
    }: Parameters<BookingSchedulingPort['upsertWorkingDays']>[0]) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const results: WorkingDayRecord[] = [];
      const sentinelId = '00000000-0000-0000-0000-000000000000';
      const effectiveBreaks: BreakInterval[] = breaks ?? [];
      const breaksJson = JSON.stringify(effectiveBreaks);
      await db.transaction(async (tx) => {
        for (const workDate of dates) {
          // Use raw SQL for conflict target because the unique index is expression-based (COALESCE).
          const rows = await tx.execute<RawWorkingDayRow>(
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
      });
      return results;
    },

    async closeWorkingDays({
      organizationId,
      specialistId,
      dates,
    }: Parameters<BookingSchedulingPort['closeWorkingDays']>[0]) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const results: WorkingDayRecord[] = [];
      const sentinelId = '00000000-0000-0000-0000-000000000000';
      await db.transaction(async (tx) => {
        for (const workDate of dates) {
          const rows = await tx.execute<RawWorkingDayRow>(
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
      });
      return results;
    },

    async clearWorkingDays({
      organizationId,
      specialistId,
      dates,
    }: Parameters<BookingSchedulingPort['clearWorkingDays']>[0]) {
      const db = getDrizzle();
      const baseConds = [eq(beWd.organizationId, organizationId), inArray(beWd.workDate, dates)];
      const specialistCond =
        specialistId === null
          ? isNull(beWd.specialistId)
          : specialistId
            ? eq(beWd.specialistId, specialistId)
            : undefined;
      await db.transaction((tx) => tx.delete(beWd).where(and(...baseConds, specialistCond)));
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

    async createScheduleTemplate({
      organizationId,
      branchId,
      name,
      startMinute,
      endMinute,
      breaks,
      sortOrder,
    }: CreateScheduleTemplateInput) {
      const db = getDrizzle();
      const inserted = await db.transaction((tx) =>
        tx
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
          .returning(),
      );
      return mapTemplateRow(inserted[0]!);
    },

    async deleteScheduleTemplate(organizationId, id) {
      const db = getDrizzle();
      await db.transaction((tx) =>
        tx
          .update(beStmpl)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(and(eq(beStmpl.id, id), eq(beStmpl.organizationId, organizationId))),
      );
    },

    // ── Nearest free window (C3) ─────────────────────────────────────────────

    async nearestFreeWindow({
      organizationId,
      specialistId,
      branchId,
      roomId,
      timeZone,
      nowOverride,
    }) {
      const now = nowOverride ?? new Date();
      const nowMs = now.getTime();
      const todayKey = localDateKey(now.toISOString(), timeZone);

      // Рабочие часы weekday-модели
      const workingHoursRaw = await this.listWorkingHours({
        organizationId,
        specialistId,
        branchId,
        roomId,
      });
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
      const dayIntervals = workingIntervalsForDate(
        todayKey,
        timeZone,
        effectiveHours,
        0,
        effectivePerDayRow,
      );
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
