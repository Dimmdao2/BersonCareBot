import type { AppointmentStatus } from "./types";

export const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
  "completed",
  "visit_confirmed",
  "charged_to_package",
]);

const VALID_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  created: [
    "awaiting_payment",
    "confirmed",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "manual_review_required",
  ],
  awaiting_payment: [
    "paid",
    "confirmed",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "manual_review_required",
  ],
  paid: [
    "confirmed",
    "rescheduled",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "late_cancellation",
    "manual_review_required",
  ],
  confirmed: [
    "rescheduled",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "late_cancellation",
    "no_show",
    "completed",
    "visit_confirmed",
    "charged_to_package",
    "manual_review_required",
  ],
  rescheduled: [
    "confirmed",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "late_cancellation",
    "manual_review_required",
  ],
  cancelled_by_patient: [],
  cancelled_by_specialist: [],
  late_cancellation: [],
  no_show: [],
  completed: [],
  visit_confirmed: [],
  charged_to_package: ["visit_confirmed", "confirmed", "completed"],
  manual_review_required: [
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
  ],
};

export function assertValidAppointmentStatusTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (from === to) return;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Недопустимый переход статуса: ${from} → ${to}`);
  }
}

export function isTerminalAppointmentStatus(status: AppointmentStatus): boolean {
  return TERMINAL_APPOINTMENT_STATUSES.has(status);
}
