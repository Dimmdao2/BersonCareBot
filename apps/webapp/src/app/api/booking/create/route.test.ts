import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const createBookingMock = vi.hoisted(() => vi.fn());
const requirePatientBookingTrustedPhoneAccessMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({ requirePatientBookingTrustedPhoneAccess: requirePatientBookingTrustedPhoneAccessMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { createBooking: createBookingMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: { resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock },
  }),
}));

import { POST } from "./route";

const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const session = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/booking/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/booking/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates with canonical branchId+serviceId", async () => {
    requirePatientBookingTrustedPhoneAccessMock.mockResolvedValue({ ok: true, session });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    createBookingMock.mockResolvedValue({ id: "b1", status: "confirmed" });

    const response = await POST(request({ type: "in_person", branchId: BRANCH_ID, serviceId: SERVICE_ID, slotStart: "2026-04-01T07:00:00.000Z", slotEnd: "2026-04-01T08:00:00.000Z", contactName: "Ivan", contactPhone: "+79990001122" }));
    expect(response.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_ID, serviceId: SERVICE_ID, cityCode: "moscow" }));
  });

  it("rejects a retired branchServiceId-only payload", async () => {
    requirePatientBookingTrustedPhoneAccessMock.mockResolvedValue({ ok: true, session });
    const response = await POST(request({ type: "in_person", branchServiceId: "11111111-1111-4111-8111-111111111111", slotStart: "2026-04-01T07:00:00.000Z", slotEnd: "2026-04-01T08:00:00.000Z", contactName: "Ivan", contactPhone: "+79990001122" }));
    expect(response.status).toBe(400);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("preserves the business-access gate", async () => {
    requirePatientBookingTrustedPhoneAccessMock.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(request({}))).status).toBe(401);
  });
});
