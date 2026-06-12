export const APPOINTMENT_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "confirmed",
  "rescheduled",
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
  "completed",
  "visit_confirmed",
  "charged_to_package",
  "manual_review_required",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type BeOrganization = {
  id: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeBranch = {
  id: string;
  organizationId: string;
  title: string;
  /** Short display name (e.g. «СПб», «Мск»). Nullable; UI falls back to title. Migration 0117. */
  shortTitle: string | null;
  cityCode: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeRoom = {
  id: string;
  organizationId: string;
  branchId: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeSpecialist = {
  id: string;
  organizationId: string;
  fullName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type BeClinicService = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  prepaymentApplicable: boolean;
  usableInPackages: boolean;
  onlinePaymentApplicable: boolean;
  publicWidgetVisible: boolean;
  adminManualOnly: boolean;
  sortOrder: number;
};

export type BeSpecialistServiceAvailability = {
  id: string;
  organizationId: string;
  specialistId: string;
  serviceId: string;
  branchId: string | null;
  roomId: string | null;
  cityCode: string | null;
  durationMinutesOverride: number | null;
  priceMinorOverride: number | null;
  isActive: boolean;
  sortOrder: number;
};

export type BeServiceLocationAvailability = {
  id: string;
  organizationId: string;
  serviceId: string;
  branchId: string;
  isActive: boolean;
};

export type BeAppointment = {
  id: string;
  organizationId: string;
  branchId: string | null;
  roomId: string | null;
  specialistId: string | null;
  serviceId: string | null;
  platformUserId: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  source: "native" | "rubitime_projection" | "admin_manual" | "public_widget";
  status: AppointmentStatus;
  originalStartAt: string | null;
  rescheduleCount: number;
  paymentRef: string | null;
  packageUsageRef: string | null;
  phoneNormalized: string | null;
  attributionJson: Record<string, unknown>;
};

export type CreateAppointmentInput = {
  organizationId: string;
  branchId?: string | null;
  roomId?: string | null;
  specialistId?: string | null;
  serviceId?: string | null;
  platformUserId?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  source: BeAppointment["source"];
  status?: AppointmentStatus;
  phoneNormalized?: string | null;
  actorId?: string | null;
  attributionJson?: Record<string, unknown>;
};

export type TransitionAppointmentStatusInput = {
  appointmentId: string;
  toStatus: AppointmentStatus;
  actorId?: string | null;
  payload?: Record<string, unknown>;
};

export type BridgeProjectionStats = {
  projectedAppointments: number;
  updatedAppointments: number;
  skippedExisting: number;
  /** Mapping восстановлен для уже существующей `rubitime_projection` без дубля insert. */
  recoveredMappings: number;
};
