import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());
const setClientBlockedMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => buildAppDepsMock(),
}));

import { POST } from "./route";

const uid = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new Request(`http://localhost/api/doctor/clients/${uid}/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/doctor/clients/[userId]/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "doc-1", role: "doctor", bindings: {} } },
      },
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: uid });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
        setClientBlocked: setClientBlockedMock,
      },
    });
  });

  it("returns workspace gate response when doctor workspace is unavailable", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await POST(request({ blocked: true }), {
      params: Promise.resolve({ userId: uid }),
    });

    expect(res.status).toBe(409);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when client is outside selected organization", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const res = await POST(request({ blocked: true }), {
      params: Promise.resolve({ userId: uid }),
    });

    expect(res.status).toBe(404);
    expect(setClientBlockedMock).not.toHaveBeenCalled();
  });

  it("sets global client block only after selected workspace membership is verified", async () => {
    const res = await POST(request({ blocked: true, reason: "spam" }), {
      params: Promise.resolve({ userId: uid }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(setClientBlockedMock).toHaveBeenCalledWith({
      userId: uid,
      blocked: true,
      reason: "spam",
      actorId: "doc-1",
    });
  });
});
