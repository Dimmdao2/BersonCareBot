import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

const createBookingSyncPortMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: createBookingSyncPortMock,
}));

import { emitBookingDeletedEvent } from "./emitBookingDeletedEvent";

const booking: PatientBookingRecord = {
  id: "b1111111-1111-4111-8111-111111111111",
  userId: "u1111111-1111-4111-8111-111111111111",
  bookingType: "in_person",
  city: "moscow",
  category: "general",
  slotStart: "2026-07-22T10:00:00.000Z",
  slotEnd: "2026-07-22T11:00:00.000Z",
  status: "cancelled",
  cancelledAt: "2026-07-22T09:00:00.000Z",
  cancelReason: "patient_request",
  rubitimeId: "legacy-record-1",
  gcalEventId: null,
  contactPhone: "+79990001122",
  contactEmail: "synthetic@example.invalid",
  contactName: "Synthetic User",
  reminder24hSent: false,
  reminder2hSent: false,
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-22T09:00:00.000Z",
  branchServiceId: "legacy-branch-service-id",
  branchId: "legacy-branch-id",
  serviceId: "legacy-service-id",
  cityCodeSnapshot: "moscow",
  branchTitleSnapshot: "Legacy branch",
  serviceTitleSnapshot: "Canonical title",
  durationMinutesSnapshot: 60,
  priceMinorSnapshot: 1000,
  rubitimeBranchIdSnapshot: "10",
  rubitimeCooperatorIdSnapshot: "20",
  rubitimeServiceIdSnapshot: "30",
  rubitimeManageUrl: null,
  canonicalAppointmentId: "a1111111-1111-4111-8111-111111111111",
  canonicalInPersonContext: null,
  bookingSource: "imported",
  compatQuality: null,
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
};

describe("emitBookingDeletedEvent", () => {
  beforeEach(() => {
    createBookingSyncPortMock.mockReset();
  });

  it("does not carry legacy branchServiceId into the provider-neutral lifecycle payload", async () => {
    const emitBookingEvent = vi.fn().mockResolvedValue(undefined);
    createBookingSyncPortMock.mockReturnValue({ emitBookingEvent });

    await emitBookingDeletedEvent({
      deps: {
        patientBooking: { getByRubitimeId: vi.fn().mockResolvedValue(booking) },
        appointmentProjection: null,
      } as never,
      integratorRecordId: "legacy-record-1",
    });

    expect(emitBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "booking.deleted",
        idempotencyKey: "booking.deleted:legacy-record-1",
      }),
    );
    const emittedPayload = emitBookingEvent.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
    expect(emittedPayload).toMatchObject({
      bookingId: booking.id,
      canonicalAppointmentId: booking.canonicalAppointmentId,
      serviceTitleSnapshot: booking.serviceTitleSnapshot,
    });
    expect(emittedPayload).not.toHaveProperty("branchServiceId");
  });
});
