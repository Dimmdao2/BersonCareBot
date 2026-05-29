import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/public-booking/publicBookingRateLimit", () => ({
  resolvePublicBookingRateLimitClientKey: () => ({ ok: true, key: "127.0.0.1" }),
  isPublicBookingCreateRateLimited: (...args: unknown[]) => rateLimitMock(...args),
  PUBLIC_BOOKING_RATE_LIMIT_SEC: 3600,
}));

vi.mock("@/app-layer/platform-user/resolveOrCreateUserByPhone", () => ({
  resolveOrCreateUserByPhone: (...args: unknown[]) => resolveUserMock(...args),
}));

vi.mock("@/app-layer/platform-user/recordPublicBookingMergeCandidates", () => ({
  recordPublicBookingMergeCandidates: (...args: unknown[]) => recordMergeMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { createBooking: createBookingMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => "org-1" },
    },
  }),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));

import { POST } from "./route";

describe("POST /api/booking/public/create", () => {
  beforeEach(() => {
    rateLimitMock.mockReset();
    resolveUserMock.mockReset();
    createBookingMock.mockReset();
    recordMergeMock.mockReset();
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({
      id: "pb-1",
      canonicalAppointmentId: "appt-1",
    });
    recordMergeMock.mockResolvedValue(undefined);
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
        body: JSON.stringify({
          type: "in_person",
          branchServiceId: "00000000-0000-4000-8000-000000000001",
          cityCode: "moscow",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Test",
          contactPhone: "+79001234567",
        }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it("creates booking with public_widget channel", async () => {
    const res = await POST(
      new Request("http://localhost/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
        body: JSON.stringify({
          type: "in_person",
          branchServiceId: "00000000-0000-4000-8000-000000000001",
          cityCode: "moscow",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
          attribution: { utmSource: "tilda" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingChannel: "public_widget",
        attribution: { utmSource: "tilda" },
      }),
    );
    expect(recordMergeMock).toHaveBeenCalled();
  });
});
