import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminWorkspaceApiContextMock = vi.fn();
const ensureOwnBookableSpecialistMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireAdminWorkspaceApiContext: () => requireAdminWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
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
    staffSecurity: { assurance: "pending_enrollment" },
  },
};

describe("POST /api/account/first-run/bind-specialist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: ownerContext });
    ensureOwnBookableSpecialistMock.mockResolvedValue("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("uses only the trusted owner membership and organization without a pre-binding 2FA lock", async () => {
    // Changed because 2FA is a first-run task after workspace entry, while this repair remains owner-scoped.
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

  it("does not let a non-owner use the self-signup owner binding endpoint", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: { ...ownerContext, membershipRole: "admin" },
    });
    // Changed because owner role is now the binding guard; security readiness is no longer consulted here.
    const response = await POST();
    expect(response.status).toBe(403);
    expect(ensureOwnBookableSpecialistMock).not.toHaveBeenCalled();
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
