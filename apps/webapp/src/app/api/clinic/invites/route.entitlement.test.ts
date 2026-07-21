import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const entitlementMock = vi.hoisted(() => vi.fn());
const createInviteMock = vi.hoisted(() => vi.fn());
const getSeatStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: authMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForRead: entitlementMock,
  requireEntitlementForMutation: entitlementMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    organizationInvites: { createInvite: createInviteMock, listPending: vi.fn().mockResolvedValue([]) },
    clinicSeats: {
      getSeatStatus: getSeatStatusMock,
    },
  }),
}));

import { GET, POST } from "./route";

const workspace = { organizationId: "org-a", session: { user: { userId: "owner-a" } } };
const validBody = { email: "doctor@example.com", role: "doctor" };

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/clinic/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("clinic invites entitlement and seat ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ ok: true, ctx: workspace });
    entitlementMock.mockResolvedValue({ ok: true });
    getSeatStatusMock.mockResolvedValue({ limit: null, used: 0, available: null });
    createInviteMock.mockResolvedValue({
      ok: true,
      token: "raw-token",
      invite: {
        id: "invite-1",
        invitedEmail: validBody.email,
        invitedRole: "doctor",
        expiresAt: "2026-08-01T00:00:00.000Z",
        organizationTitle: "Clinic",
      },
    });
  });

  it("GET does not resolve entitlement or list invites when auth fails", async () => {
    authMock.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(entitlementMock).not.toHaveBeenCalled();
  });

  it("GET denies with entitlement_required when clinic_team is disabled", async () => {
    entitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "clinic_team" }, { status: 403 }),
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(entitlementMock).toHaveBeenCalledWith(workspace, "clinic_team");
    expect(getSeatStatusMock).not.toHaveBeenCalled();
  });

  it("POST does not resolve entitlement or call the service when authentication fails", async () => {
    authMock.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await POST(makePostRequest(validBody));
    expect(response.status).toBe(401);
    expect(entitlementMock).not.toHaveBeenCalled();
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("POST stops before the service call on a disabled mechanic", async () => {
    entitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "clinic_team" }, { status: 403 }),
    });
    const response = await POST(makePostRequest({ ...validBody, organizationId: "forged-org-b" }));
    expect(response.status).toBe(403);
    expect(entitlementMock).toHaveBeenCalledWith(workspace, "clinic_team");
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("POST maps the atomic seat_limit_reached denial from createInvite to 409 (no route-level pre-check)", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: false, code: "seat_limit_reached" });
    const response = await POST(makePostRequest(validBody));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "seat_limit_reached" });
    expect(createInviteMock).toHaveBeenCalledOnce();
  });

  it("POST allows an admin invite regardless of seat status and calls the service", async () => {
    const response = await POST(makePostRequest({ email: "admin@example.com", role: "admin" }));
    expect(response.status).toBe(200);
    expect(createInviteMock).toHaveBeenCalledOnce();
  });

  it("POST creates the invite after the entitlement check passes", async () => {
    const response = await POST(makePostRequest(validBody));
    expect(response.status).toBe(200);
    expect(entitlementMock).toHaveBeenCalledWith(workspace, "clinic_team");
    expect(createInviteMock).toHaveBeenCalledOnce();
  });
});
