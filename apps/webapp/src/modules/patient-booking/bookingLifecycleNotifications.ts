export type IntegratorBookingEventType =
  | "booking.created"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "booking.payment_captured";

export function buildBookingNotificationsSent(input: {
  eventType: IntegratorBookingEventType;
  idempotencyKey: string;
  notifyPatient: boolean;
  notifyStaff: boolean;
  integratorStatus: "sent" | "failed" | "skipped";
}): Record<string, unknown> {
  return {
    policy: {
      notifyPatient: input.notifyPatient,
      notifyStaff: input.notifyStaff,
    },
    integrator_booking_event: {
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      status: input.integratorStatus,
      at: new Date().toISOString(),
    },
  };
}
