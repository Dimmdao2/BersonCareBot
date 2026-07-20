import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const createManualPatientVisitMock = vi.hoisted(() => vi.fn());
const assertSlotAvailableMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: { assertSlotAvailable: assertSlotAvailableMock },
    emailSetupAccess: { requestContactEmailSetup: vi.fn() },
  }),
}));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: vi.fn(async (_ctx, _source, fn) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
}));

import { POST } from "./route";

const requestBody = {
  displayName: "Новый пациент",
  phone: "+79990000000",
  email: null,
  branchId: "11111111-1111-4111-8111-111111111111",
  specialistId: "22222222-2222-4222-8222-222222222222",
  serviceId: "33333333-3333-4333-8333-333333333333",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:00:00.000Z",
  durationMinutes: 60,
};

function request(body = requestBody) {
  return new Request("http://localhost/manual-patient-visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST manual patient visit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    assertSlotAvailableMock.mockResolvedValue(undefined);
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "44444444-4444-4444-8444-444444444444",
        session: { user: { userId: "55555555-5555-4555-8555-555555555555" } },
        service: { createManualPatientVisit: createManualPatientVisitMock },
      },
    });
  });

  it("uses one atomic domain command under the trusted organization principal", async () => {
    createManualPatientVisitMock.mockImplementation(async (input) => {
      expect(principalState.inside).toBe(true);
      return {
        patient: {
          userId: "66666666-6666-4666-8666-666666666666",
          displayName: input.displayName,
          phoneNormalized: input.phoneNormalized,
          created: true,
        },
        appointment: {
          id: "77777777-7777-4777-8777-777777777777",
          organizationId: input.organizationId,
        },
      };
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(createManualPatientVisitMock).toHaveBeenCalledOnce();
    expect(createManualPatientVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "44444444-4444-4444-8444-444444444444",
        appointment: expect.objectContaining({
          specialistId: requestBody.specialistId,
          status: "confirmed",
        }),
      }),
    );
    expect(principalState.inside).toBe(false);
  });

  it("does not open the transaction for an invalid body", async () => {
    const response = await POST(request({ ...requestBody, specialistId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
  });

  it("returns a conflict when the atomic transaction reports an occupied slot", async () => {
    createManualPatientVisitMock.mockRejectedValue(Object.assign(new Error("slot_overlap"), { code: "23P01" }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "slot_overlap" });
  });
});
