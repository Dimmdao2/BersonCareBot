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

// ── Per-date working days ────────────────────────────────────────────────────

/** Single break window within a working day. */
export type BreakInterval = { startMinute: number; endMinute: number };

export type WorkingDayRecord = {
  id: string;
  organizationId: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  workDate: string; // YYYY-MM-DD
  startMinute: number | null;
  endMinute: number | null;
  /** Legacy single-break columns (kept for backward-compat reads). */
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  /** N-break model (migration 0116). Primary source; fallback to legacy scalars when empty. */
  breaks: BreakInterval[];
  isClosed: boolean;
};

export type UpsertWorkingDaysInput = {
  organizationId: string;
  specialistId?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  dates: string[]; // YYYY-MM-DD[]
  startMinute: number;
  endMinute: number;
  /** Legacy single-break (backward-compat; ignored when breaks[] provided). */
  breakStartMinute?: number | null;
  breakEndMinute?: number | null;
  /** N-break model. Takes priority over breakStartMinute/breakEndMinute. */
  breaks?: BreakInterval[];
};

export type CloseWorkingDaysInput = {
  organizationId: string;
  specialistId?: string | null;
  dates: string[]; // YYYY-MM-DD[]
};

export type ClearWorkingDaysInput = {
  organizationId: string;
  specialistId?: string | null;
  dates: string[]; // YYYY-MM-DD[]
};

// ── Schedule templates ───────────────────────────────────────────────────────

export type ScheduleTemplateRecord = {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  startMinute: number;
  endMinute: number;
  /** Legacy single-break columns (kept for backward-compat reads). */
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  /** N-break model (migration 0116). Primary source. */
  breaks: BreakInterval[];
  sortOrder: number;
  isActive: boolean;
};

export type CreateScheduleTemplateInput = {
  organizationId: string;
  branchId?: string | null;
  name: string;
  startMinute: number;
  endMinute: number;
  /** Legacy single-break (backward-compat). */
  breakStartMinute?: number | null;
  breakEndMinute?: number | null;
  /** N-break model. Takes priority over breakStartMinute/breakEndMinute. */
  breaks?: BreakInterval[];
  sortOrder?: number;
};

// ── Nearest free window ──────────────────────────────────────────────────────

export type NearestFreeWindowInput = {
  organizationId: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  /** Таймзона бизнеса (IANA, напр. "Europe/Moscow"). */
  timeZone: string;
  /** Переопределить «сегодня» (для тестов). По умолчанию — new Date(). */
  nowOverride?: Date;
};

export type NearestFreeWindowResult = { from: string; to: string } | null;

export type BookingSchedulingPort = {
  resolveCanonicalFromBranchService(branchServiceId: string): Promise<CanonicalBookingContext | null>;
  resolveLegacyBranchServiceId(input: {
    organizationId: string;
    branchId: string;
    serviceId: string;
    specialistId?: string | null;
  }): Promise<string | null>;
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
  upsertBufferMinutes(input: {
    organizationId: string;
    specialistId?: string | null;
    minutes: number;
  }): Promise<void>;
  getMinNoticeHours(organizationId: string): Promise<number>;
  listScheduleBlocks(input: {
    organizationId: string;
    rangeStart: string;
    rangeEnd: string;
    specialistId?: string | null;
    branchId?: string | null;
    roomId?: string | null;
  }): Promise<ScheduleBlockRecord[]>;
  createScheduleBlock(input: CreateScheduleBlockInput): Promise<ScheduleBlockRecord>;
  deleteScheduleBlock(organizationId: string, blockId: string): Promise<void>;
  listWorkingHoursAdmin(input: {
    organizationId: string;
    specialistId?: string | null;
    branchId?: string | null;
    roomId?: string | null;
  }): Promise<WorkingHoursRecord[]>;
  createWorkingHours(input: CreateWorkingHoursInput): Promise<WorkingHoursRecord>;
  updateWorkingHours(input: UpdateWorkingHoursInput): Promise<WorkingHoursRecord>;
  deactivateWorkingHours(organizationId: string, id: string): Promise<void>;
  // Per-date working days
  listWorkingDays(input: {
    organizationId: string;
    specialistId?: string | null;
    dateFrom: string;
    dateTo: string;
  }): Promise<WorkingDayRecord[]>;
  upsertWorkingDays(input: UpsertWorkingDaysInput): Promise<WorkingDayRecord[]>;
  closeWorkingDays(input: CloseWorkingDaysInput): Promise<WorkingDayRecord[]>;
  clearWorkingDays(input: ClearWorkingDaysInput): Promise<void>;
  // Schedule templates
  listScheduleTemplates(organizationId: string): Promise<ScheduleTemplateRecord[]>;
  createScheduleTemplate(input: CreateScheduleTemplateInput): Promise<ScheduleTemplateRecord>;
  deleteScheduleTemplate(organizationId: string, id: string): Promise<void>;
  // Nearest free window
  nearestFreeWindow(input: NearestFreeWindowInput): Promise<NearestFreeWindowResult>;
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

export type WorkingHoursRecord = {
  id: string;
  organizationId: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  weekday: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
};

export type CreateWorkingHoursInput = {
  organizationId: string;
  specialistId?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type UpdateWorkingHoursInput = {
  organizationId: string;
  id: string;
  weekday?: number;
  startMinute?: number;
  endMinute?: number;
  isActive?: boolean;
};

export type BookingSchedulingService = {
  resolveInPersonContext(branchServiceId: string): Promise<CanonicalBookingContext | null>;
  resolveLegacyBranchServiceId(input: {
    organizationId: string;
    branchId: string;
    serviceId: string;
    specialistId?: string | null;
  }): Promise<string | null>;
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
    specialistId?: string | null;
    branchId?: string | null;
    roomId?: string | null;
  }): Promise<ScheduleBlockRecord[]>;
  createScheduleBlock(
    input: Omit<CreateScheduleBlockInput, "organizationId"> & { organizationId?: string },
  ): Promise<ScheduleBlockRecord>;
  deleteScheduleBlock(blockId: string, organizationId: string): Promise<void>;
  listWorkingHoursAdmin(input: {
    organizationId: string;
    specialistId?: string | null;
    branchId?: string | null;
    roomId?: string | null;
  }): Promise<WorkingHoursRecord[]>;
  createWorkingHours(
    input: Omit<CreateWorkingHoursInput, "organizationId"> & { organizationId?: string },
  ): Promise<WorkingHoursRecord>;
  updateWorkingHours(input: UpdateWorkingHoursInput): Promise<WorkingHoursRecord>;
  deactivateWorkingHours(id: string, organizationId: string): Promise<void>;
  usesWorkingHoursFallback(input: {
    organizationId: string;
    specialistId?: string | null;
    branchId?: string | null;
    roomId?: string | null;
  }): Promise<boolean>;
  getBufferMinutes(organizationId: string, specialistId: string | null): Promise<number>;
  upsertBufferMinutes(input: {
    organizationId: string;
    specialistId?: string | null;
    minutes: number;
  }): Promise<void>;
  getMinNoticeHours(organizationId: string): Promise<number>;
  // Per-date working days
  listWorkingDays(input: {
    organizationId: string;
    specialistId?: string | null;
    dateFrom: string;
    dateTo: string;
  }): Promise<WorkingDayRecord[]>;
  upsertWorkingDays(input: UpsertWorkingDaysInput): Promise<WorkingDayRecord[]>;
  closeWorkingDays(input: CloseWorkingDaysInput): Promise<WorkingDayRecord[]>;
  clearWorkingDays(input: ClearWorkingDaysInput): Promise<void>;
  // Schedule templates
  listScheduleTemplates(organizationId: string): Promise<ScheduleTemplateRecord[]>;
  createScheduleTemplate(input: CreateScheduleTemplateInput): Promise<ScheduleTemplateRecord>;
  deleteScheduleTemplate(id: string, organizationId: string): Promise<void>;
  applyScheduleTemplate(input: { organizationId: string; specialistId?: string | null; templateId: string; dates: string[] }): Promise<WorkingDayRecord[]>;
  // Nearest free window
  nearestFreeWindow(input: NearestFreeWindowInput): Promise<NearestFreeWindowResult>;
};
