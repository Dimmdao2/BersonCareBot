import type {
  BookingSchedulingPort,
  BookingSchedulingService,
  BreakInterval,
  NearestFreeWindowInput,
  NearestFreeWindowResult,
  UpsertWorkingDaysInput,
  CloseWorkingDaysInput,
  ClearWorkingDaysInput,
  CreateScheduleTemplateInput,
} from './ports';
import {
  busyFromRecords,
  generateSlotsFromFree,
  groupSlotsByLocalDate,
  isChainFree,
  localDateKey,
  pickWorkingHours,
  subtractBusy,
  workingIntervalsForDate,
} from './computeSlots';

// ── Validation helpers ───────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;

function assertUuid(val: string | null | undefined, field: string): void {
  if (val != null && !UUID_RE.test(val)) {
    throw new Error(`invalid_uuid:${field}`);
  }
}

function assertMinute(val: number | null | undefined, field: string): void {
  if (val != null && (val < 0 || val > 1440 || !Number.isInteger(val))) {
    throw new Error(`invalid_minute:${field}`);
  }
}

function assertDate(val: string, field: string): void {
  if (!DATE_RE.test(val)) throw new Error(`invalid_date:${field}`);
}

function assertDateRangeDays(dates: string[]): void {
  if (dates.length === 0) return;
  const sorted = [...dates].sort();
  const from = new Date(sorted[0]!).getTime();
  const to = new Date(sorted[sorted.length - 1]!).getTime();
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Error(`date_range_exceeds_max:${MAX_RANGE_DAYS}`);
  }
}

const MAX_BREAKS = 6;

/**
 * Validates the breaks[] array for a working day or template.
 * Each break must:
 *   - have startMinute < endMinute (both in 0..1440)
 *   - be contained within [dayStart, dayEnd]
 *   - not overlap with any other break
 *   - count ≤ MAX_BREAKS (6)
 * Array must be sorted by startMinute (ascending).
 */
function validateBreaks(breaks: BreakInterval[], dayStart: number, dayEnd: number): void {
  if (breaks.length === 0) return;
  if (breaks.length > MAX_BREAKS) throw new Error(`breaks_count_exceeds_max:${MAX_BREAKS}`);
  let prevEnd = -1;
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i]!;
    assertMinute(b.startMinute, `breaks[${i}].startMinute`);
    assertMinute(b.endMinute, `breaks[${i}].endMinute`);
    if (b.startMinute >= b.endMinute) throw new Error(`invalid_break_range:${i}`);
    if (b.startMinute < dayStart) throw new Error(`break_before_start:${i}`);
    if (b.endMinute > dayEnd) throw new Error(`break_after_end:${i}`);
    if (b.startMinute < prevEnd) throw new Error(`breaks_overlap:${i}`);
    // Sort invariant: each break starts after the previous one ends
    if (i > 0 && b.startMinute < breaks[i - 1]!.endMinute) {
      throw new Error(`breaks_not_sorted:${i}`);
    }
    prevEnd = b.endMinute;
  }
}

function validateUpsertInput(input: UpsertWorkingDaysInput): void {
  assertUuid(input.organizationId, 'organizationId');
  assertUuid(input.specialistId, 'specialistId');
  assertUuid(input.branchId, 'branchId');
  assertUuid(input.roomId, 'roomId');
  if (!input.dates.length) throw new Error('dates_required');
  for (const d of input.dates) assertDate(d, 'date');
  assertDateRangeDays(input.dates);
  assertMinute(input.startMinute, 'startMinute');
  assertMinute(input.endMinute, 'endMinute');
  if (input.startMinute >= input.endMinute) throw new Error('invalid_working_hours_range');
  if (input.breaks && input.breaks.length > 0) {
    validateBreaks(input.breaks, input.startMinute, input.endMinute);
  }
}

function validateScheduleTemplateInput(input: CreateScheduleTemplateInput): void {
  assertUuid(input.organizationId, 'organizationId');
  assertUuid(input.branchId, 'branchId');
  assertMinute(input.startMinute, 'startMinute');
  assertMinute(input.endMinute, 'endMinute');
  if (input.startMinute >= input.endMinute) throw new Error('invalid_template_range');
  if (input.breaks && input.breaks.length > 0) {
    validateBreaks(input.breaks, input.startMinute, input.endMinute);
  }
  if (!input.name.trim()) throw new Error('template_name_required');
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function defaultDateRange(
  date: string | undefined,
  timeZone: string,
): { from: string; to: string } {
  const today = date ?? localDateKey(new Date().toISOString(), timeZone);
  return { from: today, to: addDays(today, 13) };
}

type BookingSchedulingServiceDependencies = {
  /**
   * 3.2: physically refuses a `booking` write unless a passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'booking') => void;
};

export function createBookingSchedulingService(
  port: BookingSchedulingPort,
  dependencies: BookingSchedulingServiceDependencies = {},
): BookingSchedulingService {
  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }
  return {
    resolvePublicBookingOrganization(input) {
      return port.resolvePublicBookingOrganization(input);
    },

    async resolveInPersonContext(_legacyKey: string) {
      return null;
    },

    resolveCanonicalInPersonContext(input) {
      return port.resolveCanonicalInPersonContext(input);
    },

    nearestFreeWindow(input: NearestFreeWindowInput): Promise<NearestFreeWindowResult> {
      return port.nearestFreeWindow(input);
    },

    resolveLegacyBranchServiceId(input) {
      return port.resolveLegacyBranchServiceId(input);
    },

    async getInPersonSlots({ organizationId, branchId, serviceId, date, slotCount = 1 }) {
      const ctx = await port.resolveCanonicalInPersonContext({
        organizationId,
        branchId,
        serviceId,
      });
      if (!ctx) throw new Error('branch_service_not_found');
      const { from, to } = defaultDateRange(date, ctx.branchTimezone);
      return port.getSlots({
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        specialistId: ctx.specialistId,
        roomId: ctx.roomId,
        serviceId: ctx.serviceId,
        durationMinutes: ctx.durationMinutes,
        bufferAfterMinutes: ctx.bufferAfterMinutes,
        branchTimezone: ctx.branchTimezone,
        dateFrom: from,
        dateTo: to,
        slotCount,
      });
    },

    async getOnlineSlots({ organizationId, date, branchTimezone = 'Europe/Moscow', slotCount }) {
      const { from, to } = defaultDateRange(date, branchTimezone);
      return port.getSlots({
        organizationId,
        branchId: null,
        specialistId: null,
        roomId: null,
        serviceId: null,
        durationMinutes: 60,
        bufferAfterMinutes: 0,
        branchTimezone,
        dateFrom: from,
        dateTo: to,
        slotCount: slotCount ?? 1,
      });
    },

    async assertSlotAvailable(input) {
      let specialistId = input.specialistId ?? null;
      let roomId = input.roomId ?? null;
      let organizationId = input.organizationId ?? '';
      let durationMinutes = input.durationMinutes;
      const slotCount = input.slotCount ?? 1;
      if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > 8)
        throw new Error('invalid_slot_count');

      const busy = await port.listBusyIntervals({
        organizationId,
        specialistId,
        roomId,
        rangeStart: input.slotStart,
        rangeEnd: input.slotEnd,
        excludeAppointmentId: input.excludeAppointmentId,
      });
      if (!isChainFree(input.slotStart, slotCount, durationMinutes, busy)) {
        throw new Error('slot_overlap');
      }
    },

    listScheduleBlocks(input) {
      const now = new Date();
      const rangeStart = input.rangeStart ?? now.toISOString();
      const rangeEnd =
        input.rangeEnd ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
      return port.listScheduleBlocks({
        organizationId: input.organizationId,
        rangeStart,
        rangeEnd,
        specialistId: input.specialistId,
        branchId: input.branchId,
        roomId: input.roomId,
      });
    },

    createScheduleBlock(input) {
      if (!input.organizationId) throw new Error('organization_id_required');
      assertBookingWriteClearance();
      return port.createScheduleBlock({
        organizationId: input.organizationId,
        specialistId: input.specialistId ?? null,
        branchId: input.branchId ?? null,
        roomId: input.roomId ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        blockType: input.blockType,
        title: input.title ?? null,
        createdByActorId: input.createdByActorId ?? null,
      });
    },

    deleteScheduleBlock(blockId, organizationId) {
      assertBookingWriteClearance();
      return port.deleteScheduleBlock(organizationId, blockId);
    },

    listWorkingHoursAdmin(input) {
      return port.listWorkingHoursAdmin({
        organizationId: input.organizationId,
        specialistId: input.specialistId,
        branchId: input.branchId,
        roomId: input.roomId,
        weekday: input.weekday,
      });
    },

    createWorkingHours(input) {
      if (!input.organizationId) throw new Error('organization_id_required');
      if (input.startMinute >= input.endMinute) throw new Error('invalid_working_hours_range');
      return port.createWorkingHours({
        organizationId: input.organizationId,
        specialistId: input.specialistId ?? null,
        branchId: input.branchId ?? null,
        roomId: input.roomId ?? null,
        weekday: input.weekday,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        replace: input.replace,
      });
    },

    updateWorkingHours(input) {
      if (
        input.startMinute != null &&
        input.endMinute != null &&
        input.startMinute >= input.endMinute
      ) {
        throw new Error('invalid_working_hours_range');
      }
      return port.updateWorkingHours(input);
    },

    deactivateWorkingHours(id, organizationId) {
      return port.deactivateWorkingHours(organizationId, id);
    },

    async usesWorkingHoursFallback(input) {
      const rows = await port.listWorkingHours({
        organizationId: input.organizationId,
        specialistId: input.specialistId ?? null,
        branchId: input.branchId ?? null,
        roomId: input.roomId ?? null,
      });
      return rows.length === 0;
    },

    getBufferMinutes(organizationId, specialistId) {
      return port.getBufferMinutes(organizationId, specialistId);
    },

    upsertBufferMinutes(input) {
      return port.upsertBufferMinutes(input);
    },

    getMinNoticeHours(organizationId) {
      return port.getMinNoticeHours(organizationId);
    },

    getMaxConsecutiveSlotHours(organizationId) {
      return port.getMaxConsecutiveSlotHours(organizationId);
    },

    listWorkingDays(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.specialistId, 'specialistId');
      assertDate(input.dateFrom, 'dateFrom');
      assertDate(input.dateTo, 'dateTo');
      return port.listWorkingDays(input);
    },

    upsertWorkingDays(input) {
      validateUpsertInput(input);
      return port.upsertWorkingDays(input);
    },

    closeWorkingDays(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.specialistId, 'specialistId');
      if (!input.dates.length) throw new Error('dates_required');
      for (const d of input.dates) assertDate(d, 'date');
      return port.closeWorkingDays(input);
    },

    clearWorkingDays(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.specialistId, 'specialistId');
      if (!input.dates.length) throw new Error('dates_required');
      for (const d of input.dates) assertDate(d, 'date');
      return port.clearWorkingDays(input);
    },

    listScheduleTemplates(organizationId) {
      assertUuid(organizationId, 'organizationId');
      return port.listScheduleTemplates(organizationId);
    },

    createScheduleTemplate(input) {
      validateScheduleTemplateInput(input);
      return port.createScheduleTemplate(input);
    },

    deleteScheduleTemplate(id, organizationId) {
      return port.deleteScheduleTemplate(organizationId, id);
    },

    async applyScheduleTemplate({ organizationId, specialistId, templateId, dates }) {
      assertUuid(organizationId, 'organizationId');
      assertUuid(specialistId, 'specialistId');
      assertUuid(templateId, 'templateId');
      if (!dates.length) throw new Error('dates_required');
      for (const d of dates) assertDate(d, 'date');
      assertDateRangeDays(dates);
      const templates = await port.listScheduleTemplates(organizationId);
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) throw new Error('template_not_found');
      return port.upsertWorkingDays({
        organizationId,
        specialistId: specialistId ?? null,
        branchId: tmpl.branchId,
        roomId: null,
        dates,
        startMinute: tmpl.startMinute,
        endMinute: tmpl.endMinute,
        breaks: tmpl.breaks,
      });
    },
  };
}

export function buildSlotsForContext(
  port: BookingSchedulingPort,
  context: Parameters<BookingSchedulingPort['getSlots']>[0],
): Promise<import('@/modules/patient-booking/types').BookingSlotsByDate[]> {
  return computeSlotsInternal(port, context);
}

async function computeSlotsInternal(
  port: BookingSchedulingPort,
  context: Parameters<BookingSchedulingPort['getSlots']>[0],
): Promise<import('@/modules/patient-booking/types').BookingSlotsByDate[]> {
  const working = pickWorkingHours(
    await port.listWorkingHours({
      organizationId: context.organizationId,
      specialistId: context.specialistId,
      branchId: context.branchId,
      roomId: context.roomId,
    }),
  );
  const bufferMinutes = await port.getBufferMinutes(context.organizationId, context.specialistId);
  const minNoticeHours = await port.getMinNoticeHours(context.organizationId);
  const minSlotStartMs = Date.now() + minNoticeHours * 3_600_000;
  const rangeStart = `${context.dateFrom}T00:00:00.000Z`;
  const rangeEnd = `${context.dateTo}T23:59:59.999Z`;

  // Load per-date overrides; absence → undefined → weekday fallback (backward-compatible)
  const perDayRows = await port.listWorkingDays({
    organizationId: context.organizationId,
    specialistId: context.specialistId,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
  });
  const perDayMap = new Map(perDayRows.map((r) => [r.workDate, r]));

  const busy = await port.listBusyIntervals({
    organizationId: context.organizationId,
    specialistId: context.specialistId,
    roomId: context.roomId,
    rangeStart,
    rangeEnd,
  });
  const busyMs = busyFromRecords(busy);
  const slotCount = context.slotCount ?? 1;
  const slotDuration = context.durationMinutes * slotCount;
  const requiredDuration = slotDuration + (context.bufferAfterMinutes ?? 0);
  const allSlots: { startAt: string; endAt: string }[] = [];

  let day = context.dateFrom;
  while (day <= context.dateTo) {
    const perDayRow = perDayMap.get(day);
    // Per-date override is scoped to the location assigned that day (model: one branch per day).
    // If the assigned branch differs from the queried branch, the specialist is committed elsewhere
    // that day → no availability for this branch (mirrors branch-scoping of weekday be_working_hours).
    const effectivePerDayRow =
      perDayRow &&
      perDayRow.branchId != null &&
      context.branchId != null &&
      perDayRow.branchId !== context.branchId
        ? { ...perDayRow, isClosed: true }
        : perDayRow;
    const workingIntervals = workingIntervalsForDate(
      day,
      context.branchTimezone,
      working,
      bufferMinutes,
      effectivePerDayRow,
    );
    const free = subtractBusy(workingIntervals, busyMs);
    const daySlots = generateSlotsFromFree(
      free,
      slotDuration,
      context.durationMinutes,
      requiredDuration,
    );
    for (const slot of daySlots) {
      if (new Date(slot.startAt).getTime() < minSlotStartMs) continue;
      if (slotCount > 1 && !isChainFree(slot.startAt, slotCount, context.durationMinutes, busy)) {
        continue;
      }
      allSlots.push(slot);
    }
    day = addDays(day, 1);
  }

  return groupSlotsByLocalDate(allSlots, context.branchTimezone);
}
