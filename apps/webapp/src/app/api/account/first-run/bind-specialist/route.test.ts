import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminWorkspaceApiContextMock = vi.fn();
const getStatusMock = vi.fn();
const ensureOwnBookableSpecialistMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireAdminWorkspaceApiContext: () => requireAdminWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    staffSecurity: { getStatus: getStatusMock },
    organizationProvisioning: { ensureOwnBookableSpecialist: ensureOwnBookableSpecialistMock },
  }),
}));

import { POST } from "./route";

const ownerContext = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  membershipRole: "owner",
  specialistId: null,
  session: {
    user: {
      userId: "11111111-1111-4111-8111-111111111111",
      role: "doctor",
      displayName: "Owner Doctor",
      bindings: {},
    },
    staffSecurity: { assurance: "factor_verified" },
  },
};

describe("POST /api/account/first-run/bind-specialist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: ownerContext });
    getStatusMock.mockResolvedValue({
      enrolled: true,
      recoveryConfirmed: true,
      replacementRequired: false,
    });
    ensureOwnBookableSpecialistMock.mockResolvedValue("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("uses only the trusted session membership and organization for the binding", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(ensureOwnBookableSpecialistMock).toHaveBeenCalledWith({
      organizationId: ownerContext.organizationId,
      membershipId: ownerContext.membershipId,
      platformUserId: ownerContext.session.user.userId,
      membershipRole: "owner",
      specialistId: null,
      displayName: "Owner Doctor",
    });
  });

  it("fails closed before binding when factor or recovery setup is incomplete", async () => {
    getStatusMock.mockResolvedValueOnce({
      enrolled: true,
      recoveryConfirmed: false,
      replacementRequired: false,
    });

    const response = await POST();
    expect(response.status).toBe(403);
    expect(ensureOwnBookableSpecialistMock).not.toHaveBeenCalled();
  });

  it("does not let a non-owner use the self-signup owner binding endpoint", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: { ...ownerContext, membershipRole: "admin" },
    });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it("passes through a rejected workspace gate", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(ensureOwnBookableSpecialistMock).not.toHaveBeenCalled();
  });
});
