import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());
const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";

vi.mock("@/modules/public-booking/publicBookingRateLimit", () => ({
  resolvePublicBookingRateLimitClientKey: () => ({ ok: true, key: "127.0.0.1" }),
  isPublicBookingCreateRateLimited: (...args: unknown[]) => rateLimitMock(...args),
  PUBLIC_BOOKING_RATE_LIMIT_SEC: 3600,
}));
vi.mock("@/app-layer/platform-user/resolveOrCreateUserByPhone", () => ({ resolveOrCreateUserByPhone: (...args: unknown[]) => resolveUserMock(...args) }));
vi.mock("@/app-layer/platform-user/recordPublicBookingMergeCandidates", () => ({ recordPublicBookingMergeCandidates: (...args: unknown[]) => recordMergeMock(...args) }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { createBooking: createBookingMock },
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: { resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock, resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock },
  }),
}));
vi.mock("@/app-layer/db/client", () => ({ getPool: () => ({}) }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/booking/public/create", { method: "POST", headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" }, body: JSON.stringify(body) });
}

describe("POST /api/booking/public/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({ id: "pb-1", canonicalAppointmentId: "appt-1" });
    recordMergeMock.mockResolvedValue(undefined);
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
  });

  it("creates a public booking from canonical branch/service ids", async () => {
    const response = await POST(request({ type: "in_person", orgSlug: "clinic-a", branchId: BRANCH_ID, serviceId: SERVICE_ID, slotStart: "2026-06-01T10:00:00.000Z", slotEnd: "2026-06-01T11:00:00.000Z", contactName: "Иван", contactPhone: "+79001234567", attribution: { utmSource: "tilda" } }));
    expect(response.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({ bookingChannel: "public_widget", branchId: BRANCH_ID, serviceId: SERVICE_ID, cityCode: "moscow" }));
  });

  it("rejects a retired branchServiceId-only payload", async () => {
    const response = await POST(request({ type: "in_person", orgSlug: "clinic-a", branchServiceId: "00000000-0000-4000-8000-000000000001", slotStart: "2026-06-01T10:00:00.000Z", slotEnd: "2026-06-01T11:00:00.000Z", contactName: "Иван", contactPhone: "+79001234567" }));
    expect(response.status).toBe(400);
    expect(createBookingMock).not.toHaveBeenCalled();
  });
});
