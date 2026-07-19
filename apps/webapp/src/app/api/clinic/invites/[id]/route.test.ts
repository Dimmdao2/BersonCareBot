import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireClinicManagementApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: () => requireClinicManagementApiContextMock(),
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: (...args: unknown[]) => requireEntitlementMock(...args),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { DELETE } from "./route";

const ORG_ID = "ed63b540-3fb6-499d-897c-f52227ea5dd8";
const INVITE_ID = "33333333-3333-4333-8333-333333333333";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/clinic/invites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementApiContextMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG_ID } });
    requireEntitlementMock.mockResolvedValue({ ok: true });
  });

  it("returns the clinic-management guard response before checking entitlement", async () => {
    requireClinicManagementApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await DELETE(new Request("http://localhost"), makeParams(INVITE_ID));
    expect(res.status).toBe(403);
    expect(requireEntitlementMock).not.toHaveBeenCalled();
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("denies with entitlement_required before resolving deps when clinic_team is disabled", async () => {
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "clinic_team" }, { status: 403 }),
    });
    const res = await DELETE(new Request("http://localhost"), makeParams(INVITE_ID));
    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("revokes the invite in the guard organization", async () => {
    const revokeInvite = vi.fn().mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({ organizationInvites: { revokeInvite } });

    const res = await DELETE(new Request("http://localhost"), makeParams(INVITE_ID));

    expect(res.status).toBe(200);
    expect(revokeInvite).toHaveBeenCalledWith({ organizationId: ORG_ID, inviteId: INVITE_ID });
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns 404 when the invite is not found in the guard organization", async () => {
    const revokeInvite = vi.fn().mockResolvedValue(false);
    buildAppDepsMock.mockReturnValue({ organizationInvites: { revokeInvite } });

    const res = await DELETE(new Request("http://localhost"), makeParams(INVITE_ID));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "invite_not_found" });
  });

  it("rejects a non-UUID id before resolving deps", async () => {
    const res = await DELETE(new Request("http://localhost"), makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
