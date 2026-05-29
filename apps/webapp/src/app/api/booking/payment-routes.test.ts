import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { routePaths } from "@/app-layer/routes/paths";

const getBookingPaymentStatusMock = vi.hoisted(() => vi.fn());
const getBookingPaymentStatusForContactMock = vi.hoisted(() => vi.fn());
const listPaymentHistoryMock = vi.hoisted(() => vi.fn());
const captureIntentForBookingMock = vi.hoisted(() => vi.fn());
const requirePatientBookingTrustedPhoneAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/guards/requireRole")>();
  return {
    ...actual,
    requirePatientBookingTrustedPhoneAccess: requirePatientBookingTrustedPhoneAccessMock,
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: {
      getBookingPaymentStatus: getBookingPaymentStatusMock,
      getBookingPaymentStatusForContact: getBookingPaymentStatusForContactMock,
      listPaymentHistory: listPaymentHistoryMock,
    },
    payments: { captureIntentForBooking: captureIntentForBookingMock },
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

describe("booking payment routes", () => {
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

  it("patient payment routes require trusted phone gate", async () => {
    requirePatientBookingTrustedPhoneAccessMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await getPaymentHistory();
    expect(res.status).toBe(401);
    requirePatientBookingTrustedPhoneAccessMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } },
    });
    expect(routePaths.patientBooking).toBeTruthy();
  });
});
