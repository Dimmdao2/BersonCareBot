import { describe, expect, it, vi } from "vitest";
import { createClientHistoryService } from "./service";
import type { ClientHistoryPort } from "./ports";

function port(overrides: Partial<ClientHistoryPort> = {}): ClientHistoryPort {
  return {
    listTimeline: vi.fn().mockResolvedValue([]),
    listPaymentHistory: vi.fn().mockResolvedValue([]),
    listVisitHistory: vi.fn().mockResolvedValue([]),
    getBookingProfile: vi.fn().mockResolvedValue(null),
    upsertBookingProfile: vi.fn(),
    isBookingBlocked: vi.fn().mockResolvedValue(false),
    listAppointmentComments: vi.fn().mockResolvedValue([]),
    createAppointmentComment: vi.fn(),
    ...overrides,
  };
}

describe("createClientHistoryService", () => {
  it("assertSelfServiceBookingAllowed throws when blocked", async () => {
    const p = port({ isBookingBlocked: vi.fn().mockResolvedValue(true) });
    const svc = createClientHistoryService(p);
    await expect(svc.assertSelfServiceBookingAllowed("org-1", "user-1")).rejects.toThrow("booking_blocked");
  });

  it("createAppointmentComment rejects empty body", () => {
    const svc = createClientHistoryService(port());
    expect(() =>
      svc.createAppointmentComment({
        organizationId: "org-1",
        appointmentId: "appt-1",
        platformUserId: "user-1",
        authorId: "doc-1",
        body: "   ",
      }),
    ).toThrow("empty_comment");
  });

  it("upsertBookingProfile trims problematic note", async () => {
    const upsert = vi.fn().mockResolvedValue({
      platformUserId: "user-1",
      organizationId: "org-1",
      isProblematic: true,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    const svc = createClientHistoryService(port({ upsertBookingProfile: upsert }));
    await svc.upsertBookingProfile({
      organizationId: "org-1",
      platformUserId: "user-1",
      isProblematic: true,
      problematicNote: "  ",
      updatedBy: "doc-1",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ problematicNote: null }),
    );
  });
});
