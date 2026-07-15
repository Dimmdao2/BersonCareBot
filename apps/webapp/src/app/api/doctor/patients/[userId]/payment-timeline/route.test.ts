import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient payment timeline route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: DOCTOR_ID, role: "doctor" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
  });

  it("returns workspace gate response before resolving deps", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(409);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("rejects timeline reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const listPayments = vi.fn();
    const listPaymentHistoryForUser = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { listPayments },
      payments: { listPaymentHistoryForUser },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(listPayments).not.toHaveBeenCalled();
    expect(listPaymentHistoryForUser).not.toHaveBeenCalled();
  });

  it("loads both payment sources for canonical patient in selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const listPayments = vi.fn().mockResolvedValue([
      {
        id: "cash-1",
        createdAt: "2026-07-01T10:00:00.000Z",
        kind: "cash",
        status: "paid",
        amountMinor: 1000,
        currency: "RUB",
        service: "visit",
        comment: null,
        provider: null,
        visitId: null,
      },
    ]);
    const listPaymentHistoryForUser = vi.fn().mockResolvedValue([
      {
        id: "hist-1",
        occurredAt: "2026-07-01T11:00:00.000Z",
        eventType: "payment.captured",
        status: "captured",
        amountMinor: 2000,
        currency: "RUB",
        purpose: "prepay",
        comment: null,
        providerId: "mock",
        appointmentId: "appt-1",
      },
    ]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { listPayments },
      payments: { listPaymentHistoryForUser },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    const json = (await res.json()) as { timeline?: Array<{ id: string }>; totalCashMinor?: number };

    expect(res.status).toBe(200);
    expect(json.timeline?.map((entry) => entry.id)).toEqual(["hist-1", "cash-1"]);
    expect(json.totalCashMinor).toBe(1000);
    expect(listPayments).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
    expect(listPaymentHistoryForUser).toHaveBeenCalledWith(CANONICAL_PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });
});
