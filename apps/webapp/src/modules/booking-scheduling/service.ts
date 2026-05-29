import type { BookingSchedulingPort, BookingSchedulingService } from "./ports";
import {
  busyFromRecords,
  generateSlotsFromFree,
  groupSlotsByLocalDate,
  isChainFree,
  localDateKey,
  pickWorkingHours,
  subtractBusy,
  workingIntervalsForDate,
} from "./computeSlots";

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function defaultDateRange(date: string | undefined, timeZone: string): { from: string; to: string } {
  const today = date ?? localDateKey(new Date().toISOString(), timeZone);
  return { from: today, to: addDays(today, 13) };
}

export function createBookingSchedulingService(port: BookingSchedulingPort): BookingSchedulingService {
  return {
    resolveInPersonContext(branchServiceId: string) {
      return port.resolveCanonicalFromBranchService(branchServiceId);
    },

    async getInPersonSlots({ branchServiceId, date, slotCount = 1 }) {
      const ctx = await port.resolveCanonicalFromBranchService(branchServiceId);
      if (!ctx) throw new Error("branch_service_not_found");
      const { from, to } = defaultDateRange(date, ctx.branchTimezone);
      return port.getSlots({
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        specialistId: ctx.specialistId,
        roomId: ctx.roomId,
        serviceId: ctx.serviceId,
        durationMinutes: ctx.durationMinutes,
        branchTimezone: ctx.branchTimezone,
        dateFrom: from,
        dateTo: to,
        slotCount,
      });
    },

    async getOnlineSlots({ organizationId, date, branchTimezone = "Europe/Moscow", slotCount }) {
      const { from, to } = defaultDateRange(date, branchTimezone);
      return port.getSlots({
        organizationId,
        branchId: null,
        specialistId: null,
        roomId: null,
        serviceId: null,
        durationMinutes: 60,
        branchTimezone,
        dateFrom: from,
        dateTo: to,
        slotCount: slotCount ?? 1,
      });
    },

    async assertSlotAvailable(input) {
      let specialistId = input.specialistId ?? null;
      let roomId = input.roomId ?? null;
      let organizationId = input.organizationId ?? "";
      let durationMinutes = input.durationMinutes;

      if (input.branchServiceId) {
        const ctx = await port.resolveCanonicalFromBranchService(input.branchServiceId);
        if (!ctx) throw new Error("branch_service_not_found");
        specialistId = ctx.specialistId;
        roomId = ctx.roomId;
        organizationId = ctx.organizationId;
        durationMinutes = ctx.durationMinutes;
      }

      const busy = await port.listBusyIntervals({
        organizationId,
        specialistId,
        roomId,
        rangeStart: input.slotStart,
        rangeEnd: input.slotEnd,
      });
      if (
        !isChainFree(
          input.slotStart,
          1,
          Math.round((new Date(input.slotEnd).getTime() - new Date(input.slotStart).getTime()) / 60_000) ||
            durationMinutes,
          busy,
        )
      ) {
        throw new Error("slot_overlap");
      }
    },

    listScheduleBlocks(input) {
      const now = new Date();
      const rangeStart = input.rangeStart ?? now.toISOString();
      const rangeEnd = input.rangeEnd ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
      return port.listScheduleBlocks({
        organizationId: input.organizationId,
        rangeStart,
        rangeEnd,
      });
    },

    createScheduleBlock(input) {
      if (!input.organizationId) throw new Error("organization_id_required");
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
      return port.deleteScheduleBlock(organizationId, blockId);
    },
  };
}

export function buildSlotsForContext(
  port: BookingSchedulingPort,
  context: Parameters<BookingSchedulingPort["getSlots"]>[0],
): Promise<import("@/modules/patient-booking/types").BookingSlotsByDate[]> {
  return computeSlotsInternal(port, context);
}

async function computeSlotsInternal(
  port: BookingSchedulingPort,
  context: Parameters<BookingSchedulingPort["getSlots"]>[0],
): Promise<import("@/modules/patient-booking/types").BookingSlotsByDate[]> {
  const working = pickWorkingHours(
    await port.listWorkingHours({
      organizationId: context.organizationId,
      specialistId: context.specialistId,
      branchId: context.branchId,
      roomId: context.roomId,
    }),
  );
  const bufferMinutes = await port.getBufferMinutes(context.organizationId, context.specialistId);
  const rangeStart = `${context.dateFrom}T00:00:00.000Z`;
  const rangeEnd = `${context.dateTo}T23:59:59.999Z`;
  const busy = await port.listBusyIntervals({
    organizationId: context.organizationId,
    specialistId: context.specialistId,
    roomId: context.roomId,
    rangeStart,
    rangeEnd,
  });
  const busyMs = busyFromRecords(busy);
  const slotCount = context.slotCount ?? 1;
  const totalDuration = context.durationMinutes * slotCount;
  const allSlots: { startAt: string; endAt: string }[] = [];

  let day = context.dateFrom;
  while (day <= context.dateTo) {
    const workingIntervals = workingIntervalsForDate(day, context.branchTimezone, working, bufferMinutes);
    const free = subtractBusy(workingIntervals, busyMs);
    const daySlots = generateSlotsFromFree(free, totalDuration, context.durationMinutes);
    for (const slot of daySlots) {
      if (slotCount > 1 && !isChainFree(slot.startAt, slotCount, context.durationMinutes, busy)) {
        continue;
      }
      allSlots.push(slot);
    }
    day = addDays(day, 1);
  }

  return groupSlotsByLocalDate(allSlots, context.branchTimezone);
}
