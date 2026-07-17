import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listTimelineMock = vi.hoisted(() => vi.fn());
const listPaymentHistoryMock = vi.hoisted(() => vi.fn());
const listVisitHistoryMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() => vi.fn());

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
      listTimeline: listTimelineMock,
      listPaymentHistory: listPaymentHistoryMock,
      listVisitHistory: listVisitHistoryMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

import { GET as getHistory } from "./history/route";
import { GET as getPaymentHistory } from "./payment-history/route";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type PrincipalContext = { organizationId: string; source: string };

describe("patient booking history routes", () => {
  let activeOrganizationId: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    activeOrganizationId = null;
    requirePatientApiBusinessAccessMock.mockResolvedValue({
      ok: true,
      // A verified email/password patient is business-enabled without a trusted phone.
      session: { user: { userId: USER_A, role: "client" } },
    });
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
    });
    withExplicitOrganizationPrincipalMock.mockImplementation(
      async (ctx: PrincipalContext, fn: () => Promise<unknown>) => {
        activeOrganizationId = ctx.organizationId;
        try {
          return await fn();
        } finally {
          activeOrganizationId = null;
        }
      },
    );
    listTimelineMock.mockImplementation(async (organizationId: string, userId: string) => {
      expect(activeOrganizationId).toBe(organizationId);
      return [{ id: `timeline:${organizationId}:${userId}` }];
    });
    listPaymentHistoryMock.mockImplementation(async (organizationId: string, userId: string) => {
      expect(activeOrganizationId).toBe(organizationId);
      return [{ id: `payment:${organizationId}:${userId}` }];
    });
    listVisitHistoryMock.mockImplementation(async (organizationId: string, userId: string) => {
      expect(activeOrganizationId).toBe(organizationId);
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
    expect(listTimelineMock).toHaveBeenCalledWith(ORG_A, USER_A, 50);
    expect(listVisitHistoryMock).toHaveBeenCalledWith(ORG_A, USER_A, 50);
    expect(listPaymentHistoryMock).toHaveBeenCalledTimes(2);
    expect(listPaymentHistoryMock).toHaveBeenNthCalledWith(1, ORG_A, USER_A, 50);
    expect(listPaymentHistoryMock).toHaveBeenNthCalledWith(2, ORG_A, USER_A, 50);
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORG_A, source: "api/booking/history:GET" },
      expect.any(Function),
    );
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORG_A, source: "api/booking/payment-history:GET" },
      expect.any(Function),
    );
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
    expect(withExplicitOrganizationPrincipalMock).not.toHaveBeenCalled();
    expect(listTimelineMock).not.toHaveBeenCalled();
    expect(listPaymentHistoryMock).not.toHaveBeenCalled();
    expect(listVisitHistoryMock).not.toHaveBeenCalled();
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

    expect(listPaymentHistoryMock).toHaveBeenNthCalledWith(1, ORG_A, USER_A, 50);
    expect(listPaymentHistoryMock).toHaveBeenNthCalledWith(2, ORG_B, USER_B, 50);
    expect(listPaymentHistoryMock).not.toHaveBeenCalledWith(ORG_A, USER_B, expect.anything());
    expect(listPaymentHistoryMock).not.toHaveBeenCalledWith(ORG_B, USER_A, expect.anything());
  });
});
