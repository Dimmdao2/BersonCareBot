import type { BookingSlotsByDate } from "@/modules/patient-booking/types";

export type SchedulingContext = {
  organizationId: string;
  branchId: string | null;
  specialistId: string | null;
  roomId: string | null;
  serviceId: string | null;
  durationMinutes: number;
  branchTimezone: string;
  /** Inclusive local dates YYYY-MM-DD */
  dateFrom: string;
  dateTo: string;
  slotCount?: number;
};

export type CanonicalBookingContext = {
  organizationId: string;
  branchId: string;
  specialistId: string;
  serviceId: string;
  roomId: string | null;
  branchServiceId: string;
  durationMinutes: number;
  branchTimezone: string;
};

export type BookingSchedulingPort = {
  resolveCanonicalFromBranchService(branchServiceId: string): Promise<CanonicalBookingContext | null>;
  listServicesByCityCode(organizationId: string, cityCode: string): Promise<{ serviceId: string; branchId: string }[]>;
  getSlots(context: SchedulingContext): Promise<BookingSlotsByDate[]>;
  listBusyIntervals(input: {
    organizationId: string;
    specialistId: string | null;
    roomId: string | null;
    rangeStart: string;
    rangeEnd: string;
    excludeAppointmentId?: string;
  }): Promise<{ startAt: string; endAt: string }[]>;
  listWorkingHours(input: {
    organizationId: string;
    specialistId: string | null;
    branchId: string | null;
    roomId: string | null;
  }): Promise<{ weekday: number; startMinute: number; endMinute: number }[]>;
  getBufferMinutes(organizationId: string, specialistId: string | null): Promise<number>;
  listScheduleBlocks(input: {
    organizationId: string;
    rangeStart: string;
    rangeEnd: string;
  }): Promise<ScheduleBlockRecord[]>;
  createScheduleBlock(input: CreateScheduleBlockInput): Promise<ScheduleBlockRecord>;
  deleteScheduleBlock(organizationId: string, blockId: string): Promise<void>;
};

export type ScheduleBlockRecord = {
  id: string;
  organizationId: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  startAt: string;
  endAt: string;
  blockType: string;
  title: string | null;
};

export type CreateScheduleBlockInput = {
  organizationId: string;
  specialistId?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  startAt: string;
  endAt: string;
  blockType: "block" | "absence";
  title?: string | null;
  createdByActorId?: string | null;
};

export type BookingSchedulingService = {
  resolveInPersonContext(branchServiceId: string): Promise<CanonicalBookingContext | null>;
  getInPersonSlots(input: {
    branchServiceId: string;
    date?: string;
    slotCount?: number;
  }): Promise<BookingSlotsByDate[]>;
  getOnlineSlots(input: {
    organizationId: string;
    category: string;
    date?: string;
    branchTimezone?: string;
    slotCount?: number;
  }): Promise<BookingSlotsByDate[]>;
  assertSlotAvailable(input: {
    branchServiceId?: string;
    organizationId?: string;
    specialistId?: string | null;
    roomId?: string | null;
    slotStart: string;
    slotEnd: string;
    durationMinutes: number;
    excludeAppointmentId?: string;
  }): Promise<void>;
  listScheduleBlocks(input: {
    organizationId: string;
    rangeStart?: string;
    rangeEnd?: string;
  }): Promise<ScheduleBlockRecord[]>;
  createScheduleBlock(
    input: Omit<CreateScheduleBlockInput, "organizationId"> & { organizationId?: string },
  ): Promise<ScheduleBlockRecord>;
  deleteScheduleBlock(blockId: string, organizationId: string): Promise<void>;
};
