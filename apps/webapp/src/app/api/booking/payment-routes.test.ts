import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { routePaths } from "@/app-layer/routes/paths";

const getBookingPaymentStatusMock = vi.hoisted(() => vi.fn());
const getBookingPaymentStatusForContactMock = vi.hoisted(() => vi.fn());
const resolveBookingOrganizationIdMock = vi.hoisted(() => vi.fn());
const listPaymentHistoryMock = vi.hoisted(() => vi.fn());
const captureIntentForBookingMock = vi.hoisted(() => vi.fn());
const resolveIntentOrganizationIdMock = vi.hoisted(() => vi.fn());
const requirePatientBookingTrustedPhoneAccessMock = vi.hoisted(() => vi.fn());
const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() => vi.fn());
const ORG_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/app-layer/guards/requireRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/guards/requireRole")>();
  return {
    ...actual,
    requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
    requirePatientBookingTrustedPhoneAccess: requirePatientBookingTrustedPhoneAccessMock,
  };
});

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: {
      getBookingPaymentStatus: getBookingPaymentStatusMock,
      getBookingPaymentStatusForContact: getBookingPaymentStatusForContactMock,
      resolveBookingOrganizationId: resolveBookingOrganizationIdMock,
    },
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    clientHistory: { listPaymentHistory: listPaymentHistoryMock },
    payments: {
      captureIntentForBooking: captureIntentForBookingMock,
      resolveIntentOrganizationId: resolveIntentOrganizationIdMock,
    },
    bookingEngine: { organization: { getDefaultOrganizationId: async () => "org-1" } },
  }),
}));

import { GET as getPaymentStatus } from "./payment-status/route";
import { GET as getPaymentHistory } from "./payment-history/route";
import { GET as getPublicPaymentStatus } from "./public/payment-status/route";
import { POST as postPublicMockComplete } from "./public/payments/mock-complete/route";

requirePatientBookingTrustedPhoneAccessMock.mockResolvedValue({
  ok: true,
  session: { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } },
});
requirePatientApiBusinessAccessMock.mockResolvedValue({
  ok: true,
  session: { user: { userId: "u1", role: "client" as const } },
});
resolveActiveOrganizationForPatientMock.mockResolvedValue({ ok: true, organizationId: ORG_ID });
withExplicitOrganizationPrincipalMock.mockImplementation(async (_ctx, fn: () => Promise<unknown>) => fn());
resolveIntentOrganizationIdMock.mockResolvedValue(ORG_ID);
resolveBookingOrganizationIdMock.mockResolvedValue(ORG_ID);

describe("booking payment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/booking/payment-status requires bookingId", async () => {
    const res = await getPaymentStatus(new Request("http://localhost/api/booking/payment-status"));
    expect(res.status).toBe(400);
  });

  it("GET /api/booking/payment-status returns status", async () => {
    getBookingPaymentStatusMock.mockResolvedValue({
      ok: true,
      booking: { id: "b1", status: "awaiting_payment" },
      summary: null,
      intentId: "intent-1",
    });
    const res = await getPaymentStatus(
      new Request("http://localhost/api/booking/payment-status?bookingId=b1"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; intentId?: string };
    expect(json.ok).toBe(true);
    expect(json.intentId).toBe("intent-1");
  });

  it("GET /api/booking/payment-history returns events", async () => {
    listPaymentHistoryMock.mockResolvedValue([{ id: "h1", eventType: "payment_captured" }]);
    const res = await getPaymentHistory();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; events?: unknown[] };
    expect(json.events).toHaveLength(1);
    expect(listPaymentHistoryMock).toHaveBeenCalledWith(ORG_ID, "u1", 50);
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORG_ID, source: "api/booking/payment-history:GET" },
      expect.any(Function),
    );
  });

  it("GET /api/booking/public/payment-status validates query", async () => {
    const res = await getPublicPaymentStatus(
      new Request("http://localhost/api/booking/public/payment-status?bookingId=b1"),
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/booking/public/payments/mock-complete captures intent", async () => {
    getBookingPaymentStatusForContactMock.mockResolvedValue({
      ok: true,
      booking: { id: "b1", userId: "u1", contactPhone: "+79990001122" },
      summary: null,
      intentId: "intent-1",
    });
    captureIntentForBookingMock.mockResolvedValue({ ok: true });
    const res = await postPublicMockComplete(
      new Request("http://localhost/api/booking/public/payments/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: "00000000-0000-4000-8000-000000000001",
          bookingId: "00000000-0000-4000-8000-000000000002",
          contactPhone: "+79990001122",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(captureIntentForBookingMock).toHaveBeenCalled();
  });

  it("patient payment history requires business access without using the trusted-phone gate", async () => {
    requirePatientApiBusinessAccessMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await getPaymentHistory();
    expect(res.status).toBe(401);
    expect(requirePatientBookingTrustedPhoneAccessMock).not.toHaveBeenCalled();
    expect(routePaths.patientBooking).toBeTruthy();
  });
});
