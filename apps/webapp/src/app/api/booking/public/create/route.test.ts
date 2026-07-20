import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111112";

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
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => ORG_ID },
      catalog: {
        getBranch: async () => ({ cityCode: "moscow", organizationId: ORG_ID }),
        listSpecialists: async () => [{ id: "sp-1", isActive: true }],
      },
      services: { getService: async () => ({ organizationId: ORG_ID }) },
    },
    bookingScheduling: {
      resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
      resolveInPersonContext: async (id: string) =>
        id ? { organizationId: ORG_ID, serviceId: "svc-1", branchId: "branch-1" } : null,
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
    resolvePublicBookingOrganizationMock.mockReset();
    resolveOrganizationIdBySlugMock.mockReset();
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({
      id: "pb-1",
      canonicalAppointmentId: "appt-1",
    });
    recordMergeMock.mockResolvedValue(undefined);
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
        body: JSON.stringify({
          type: "in_person",
          orgSlug: "clinic-a",
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
          orgSlug: "clinic-a",
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

  it("creates in_person booking with canonical branchId+serviceId", async () => {
    resolveLegacyBranchServiceIdMock.mockResolvedValue("bs-canonical");
    const res = await POST(
      new Request("http://localhost/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
        body: JSON.stringify({
          type: "in_person",
          orgSlug: "clinic-a",
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          cityCode: "moscow",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "in_person",
        branchServiceId: "bs-canonical",
      }),
    );
  });

  it("denies clinic-A confirmation carrying valid clinic-B booking ids before user creation", async () => {
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    resolvePublicBookingOrganizationMock.mockResolvedValue(OTHER_ORG_ID);

    const res = await POST(
      new Request("http://localhost/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
        body: JSON.stringify({
          type: "in_person",
          orgSlug: "clinic-a",
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          cityCode: "moscow",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "ambiguous_booking_tenant" });
    expect(resolveUserMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
  });
});
