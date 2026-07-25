import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getCurrentSessionMock }));

const getServerRuntimeBoolMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@/modules/system-settings/configAdapter", () => ({
  getServerRuntimeBool: getServerRuntimeBoolMock,
}));

import { getCurrentDbPrincipal, runWithDbBootstrapPrincipal } from "@bersoncare/db-principal";
import { requirePlatformOperationsApiContext } from "./requireRole";

const platform = {
  user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("requirePlatformOperationsApiContext", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    getServerRuntimeBoolMock.mockReset().mockResolvedValue(false);
  });

  it("returns 401 without a session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const result = await requirePlatformOperationsApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("allows only the finite platform capability and installs no-org principal", async () => {
    getCurrentSessionMock.mockResolvedValue(platform);
    await runWithDbBootstrapPrincipal({ source: "test" }, async () => {
      const result = await requirePlatformOperationsApiContext();
      expect(result.ok).toBe(true);
      expect(getCurrentDbPrincipal()).toMatchObject({ kind: "platform", platformUserId: platform.user.userId });
    });
  });

  it.each([
    {
      user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "admin", bindings: {} },
      adminMode: false,
    },
    { user: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "doctor", bindings: {} } },
    { user: { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "patient", bindings: {} } },
  ])("denies non-platform sessions", async (session) => {
    getCurrentSessionMock.mockResolvedValue(session);
    const result = await requirePlatformOperationsApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("denies restricted staff-security state", async () => {
    getCurrentSessionMock.mockResolvedValue({ ...platform, staffSecurity: { assurance: "recovery" } });
    const result = await requirePlatformOperationsApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("global 2FA switch off (default): admin without any TOTP enrollment is still allowed", async () => {
    getCurrentSessionMock.mockResolvedValue(platform);
    getServerRuntimeBoolMock.mockResolvedValue(false);
    await runWithDbBootstrapPrincipal({ source: "test" }, async () => {
      const result = await requirePlatformOperationsApiContext();
      expect(result.ok).toBe(true);
    });
  });

  it("global 2FA switch on: unenrolled admin is redirected to enroll, not hard-blocked with a 500", async () => {
    getCurrentSessionMock.mockResolvedValue(platform);
    getServerRuntimeBoolMock.mockResolvedValue(true);
    const result = await requirePlatformOperationsApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("global 2FA switch on: an admin who verified TOTP this session is still allowed", async () => {
    getCurrentSessionMock.mockResolvedValue({
      ...platform,
      staffSecurity: { assurance: "factor_verified" },
    });
    getServerRuntimeBoolMock.mockResolvedValue(true);
    await runWithDbBootstrapPrincipal({ source: "test" }, async () => {
      const result = await requirePlatformOperationsApiContext();
      expect(result.ok).toBe(true);
    });
  });
});
