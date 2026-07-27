import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { defaultBookingLifecycleNotificationsSettings } from "@/modules/booking-notifications/settings";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { createAppointmentPaymentConfirmedHandler } from "./appointmentPaymentConfirmedHandler";

const confirmedBooking: PatientBookingRecord = {
  id: "booking-1",
  userId: "user-1",
  bookingType: "online",
  city: null,
  category: "general",
  slotStart: "2026-07-22T10:00:00.000Z",
  slotEnd: "2026-07-22T11:00:00.000Z",
  status: "confirmed",
  cancelledAt: null,
  cancelReason: null,
  gcalEventId: null,
  contactPhone: "+70000000000",
  contactEmail: "synthetic@example.invalid",
  contactName: "Synthetic User",
  reminder24hSent: false,
  reminder2hSent: false,
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z",
  branchServiceId: null,
  branchId: null,
  serviceId: null,
  cityCodeSnapshot: null,
  branchTitleSnapshot: null,
  serviceTitleSnapshot: null,
  durationMinutesSnapshot: null,
  priceMinorSnapshot: null,
  canonicalAppointmentId: "appointment-1",
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
};

describe("createAppointmentPaymentConfirmedHandler", () => {
  it("is the production payment callback without a best-effort swallow", () => {
    const productionDi = readFileSync(
      new URL("../di/buildAppDeps.ts", import.meta.url),
      "utf8",
    );
    expect(productionDi).toContain("createAppointmentPaymentConfirmedHandler({");
    expect(productionDi).toContain("onAppointmentPaymentConfirmed,");
    expect(productionDi).not.toContain("Notifications are best-effort.");
  });

  it("propagates integrator delivery failure and retries the existing confirmed mirror", async () => {
    const markConfirmedByCanonicalAppointment = vi
      .fn()
      .mockResolvedValueOnce(confirmedBooking)
      .mockResolvedValueOnce(null);
    const getByCanonicalAppointmentId = vi.fn().mockResolvedValue(confirmedBooking);
    const emitBookingEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error("integrator_delivery_failed"))
      .mockResolvedValueOnce(undefined);
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment,
        getByCanonicalAppointmentId,
      },
      bookingEngine: {
        getAppointment: vi.fn().mockResolvedValue({
          id: "appointment-1",
          organizationId: "org-1",
        }),
      } as never,
      loadNotificationSettings: async () => defaultBookingLifecycleNotificationsSettings(),
      bookingSync: { emitBookingEvent },
    });
    const input = {
      appointmentId: "appointment-1",
      paymentId: "payment-1",
      platformUserId: "user-1",
    };

    await expect(handler(input)).rejects.toThrow("integrator_delivery_failed");
    await expect(handler(input)).resolves.toBeUndefined();

    expect(getByCanonicalAppointmentId).toHaveBeenCalledTimes(1);
    expect(emitBookingEvent).toHaveBeenCalledTimes(2);
    expect(emitBookingEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "booking.payment_captured",
        idempotencyKey: "booking.payment_captured:payment-1:appointment-1",
      }),
    );
  });
});
