import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

import { requireAdminModeSession } from "./requireAdminMode";

const adminSession = {
  user: { userId: "admin-1", role: "admin", displayName: "Admin", bindings: {} },
  issuedAt: 0,
  expiresAt: 9_999_999_999,
};

describe("requireAdminModeSession", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    const result = await requireAdminModeSession();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns 403 for non-admin role", async () => {
    getCurrentSessionMock.mockResolvedValue({
      ...adminSession,
      user: { ...adminSession.user, role: "doctor" },
      adminMode: true,
    });

    const result = await requireAdminModeSession();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("returns 403 when adminMode is disabled", async () => {
    getCurrentSessionMock.mockResolvedValue({ ...adminSession, adminMode: false });

    const result = await requireAdminModeSession();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = (await result.response.json()) as { error?: string };
      expect(body.error).toBe("admin_mode_required");
    }
  });

  it("allows admin with enabled adminMode", async () => {
    getCurrentSessionMock.mockResolvedValue({ ...adminSession, adminMode: true });

    const result = await requireAdminModeSession();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.user.role).toBe("admin");
    }
  });
});
