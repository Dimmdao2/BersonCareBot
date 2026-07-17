import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";

const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listPatientTimelineMock = vi.hoisted(() => vi.fn());
const listPatientPaymentHistoryMock = vi.hoisted(() => vi.fn());
const listPatientVisitHistoryMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/guards/requireRole")>();
  return {
    ...actual,
    requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    clientHistory: {
      listPatientTimeline: listPatientTimelineMock,
      listPatientPaymentHistory: listPatientPaymentHistoryMock,
      listPatientVisitHistory: listPatientVisitHistoryMock,
    },
  }),
}));

import { GET as getHistory } from "./history/route";
import { GET as getPaymentHistory } from "./payment-history/route";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("patient booking history routes", () => {
  function expectExactPatientPrincipal(organizationId: string, platformUserId: string): void {
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "patient",
      organizationId,
      platformUserId,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requirePatientApiBusinessAccessMock.mockResolvedValue({
      ok: true,
      // A verified email/password patient is business-enabled without a trusted phone.
      session: { user: { userId: USER_A, role: "client" } },
    });
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
    });
    listPatientTimelineMock.mockImplementation(async (organizationId: string, userId: string) => {
      expectExactPatientPrincipal(organizationId, userId);
      return [{ id: `timeline:${organizationId}:${userId}` }];
    });
    listPatientPaymentHistoryMock.mockImplementation(async (organizationId: string, userId: string) => {
      expectExactPatientPrincipal(organizationId, userId);
      return [{ id: `payment:${organizationId}:${userId}` }];
    });
    listPatientVisitHistoryMock.mockImplementation(async (organizationId: string, userId: string) => {
      expectExactPatientPrincipal(organizationId, userId);
      return [{ appointmentId: `visit:${organizationId}:${userId}` }];
    });
  });

  it("allows patient-tier reads without trusted phone and scopes both endpoints to the active enrollment", async () => {
    const [historyResponse, paymentResponse] = await Promise.all([
      getHistory(),
      getPaymentHistory(),
    ]);

    expect(historyResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(200);
    expect(listPatientTimelineMock).toHaveBeenCalledWith(ORG_A, USER_A, 50);
    expect(listPatientVisitHistoryMock).toHaveBeenCalledWith(ORG_A, USER_A, 50);
    expect(listPatientPaymentHistoryMock).toHaveBeenCalledTimes(2);
    expect(listPatientPaymentHistoryMock).toHaveBeenNthCalledWith(1, ORG_A, USER_A, 50);
    expect(listPatientPaymentHistoryMock).toHaveBeenNthCalledWith(2, ORG_A, USER_A, 50);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });

  it.each([
    ["no active enrollment", { ok: false, reason: "no_active_enrollment" }, 403],
    [
      "ambiguous active enrollments",
      { ok: false, reason: "organization_selection_required", organizationIds: [ORG_A, ORG_B] },
      409,
    ],
  ])("fails closed for %s", async (_label, resolution, expectedStatus) => {
    resolveActiveOrganizationForPatientMock.mockResolvedValue(resolution);

    const historyResponse = await getHistory();
    const paymentResponse = await getPaymentHistory();

    expect(historyResponse.status).toBe(expectedStatus);
    expect(paymentResponse.status).toBe(expectedStatus);
    expect(listPatientTimelineMock).not.toHaveBeenCalled();
    expect(listPatientPaymentHistoryMock).not.toHaveBeenCalled();
    expect(listPatientVisitHistoryMock).not.toHaveBeenCalled();
  });

  it("never crosses patient A/B organization walls", async () => {
    const organizationByUser = new Map([
      [USER_A, ORG_A],
      [USER_B, ORG_B],
    ]);
    resolveActiveOrganizationForPatientMock.mockImplementation(async (userId: string) => ({
      ok: true,
      organizationId: organizationByUser.get(userId),
    }));

    for (const userId of [USER_A, USER_B]) {
      requirePatientApiBusinessAccessMock.mockResolvedValueOnce({
        ok: true,
        session: { user: { userId, role: "client" } },
      });
      await getPaymentHistory();
    }

    expect(listPatientPaymentHistoryMock).toHaveBeenNthCalledWith(1, ORG_A, USER_A, 50);
    expect(listPatientPaymentHistoryMock).toHaveBeenNthCalledWith(2, ORG_B, USER_B, 50);
    expect(listPatientPaymentHistoryMock).not.toHaveBeenCalledWith(ORG_A, USER_B, expect.anything());
    expect(listPatientPaymentHistoryMock).not.toHaveBeenCalledWith(ORG_B, USER_A, expect.anything());
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });

  it("locked patient principal hides same-org other-patient and null-trust phone orphan rows", async () => {
    const lockedRows = [
      { id: "own", organizationId: ORG_A, platformUserId: USER_A },
      { id: "same-org-other", organizationId: ORG_A, platformUserId: USER_B },
      { id: "null-trust-phone-orphan", organizationId: ORG_A, platformUserId: null },
    ];
    listPatientPaymentHistoryMock.mockImplementation(async (organizationId: string, userId: string) => {
      const principal = getCurrentDbPrincipal();
      expect(principal).toEqual({
        kind: "patient",
        organizationId,
        platformUserId: userId,
        source: "api/booking/payment-history:GET",
      });
      if (principal?.kind !== "patient") throw new Error("patient_principal_required");
      return lockedRows.filter(
        (row) =>
          row.organizationId === principal.organizationId &&
          row.platformUserId === principal.platformUserId,
      );
    });

    const response = await getPaymentHistory();
    const body = (await response.json()) as { events: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.events.map((row) => row.id)).toEqual(["own"]);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });
});
