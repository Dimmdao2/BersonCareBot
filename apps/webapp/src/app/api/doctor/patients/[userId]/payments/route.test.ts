import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorApiSessionMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const listPaymentsWithSummaryMock = vi.hoisted(() => vi.fn());
const addCashPaymentMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: requireDoctorApiSessionMock,
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientPayments: {
      listPaymentsWithSummary: listPaymentsWithSummaryMock,
      addCashPayment: addCashPaymentMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOCTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const payment = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  organizationId: ORG,
  patientUserId: PATIENT,
  amountMinor: 1500,
  currency: "RUB",
  kind: "cash" as const,
  status: "paid" as const,
  comment: null,
  service: null,
  visitId: null,
  provider: null,
  providerPaymentId: null,
  createdBy: DOCTOR,
  createdAt: "2026-07-09T00:00:00.000Z",
};

function params() {
  return { params: Promise.resolve({ userId: PATIENT }) };
}

describe("/api/doctor/patients/[userId]/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorApiSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: DOCTOR } },
    });
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG, session: { user: { userId: DOCTOR } } },
    });
    listPaymentsWithSummaryMock.mockResolvedValue({ payments: [payment], totalPaidMinor: 1500 });
    addCashPaymentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return payment;
    });
  });

  it("GET lists payments without workspace principal", async () => {
    const res = await GET(new Request("http://localhost/payments"), params());
    const json = (await res.json()) as { ok?: boolean; totalPaidMinor?: number };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.totalPaidMinor).toBe(1500);
    expect(listPaymentsWithSummaryMock).toHaveBeenCalledWith(PATIENT);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("POST creates cash payment inside doctor workspace principal", async () => {
    const res = await POST(
      new Request("http://localhost/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor: 1500, currency: "RUB" }),
      }),
      params(),
    );
    const json = (await res.json()) as { ok?: boolean; payment?: typeof payment };

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.payment?.id).toBe(payment.id);
    expect(addCashPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        patientUserId: PATIENT,
        amountMinor: 1500,
        createdBy: DOCTOR,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "doctor.patients.payments.cash.create",
      expect.any(Function),
    );
  });
});
