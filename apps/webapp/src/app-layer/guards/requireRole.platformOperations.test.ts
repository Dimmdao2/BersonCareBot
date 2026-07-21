import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getCurrentSessionMock }));

import { getCurrentDbPrincipal, runWithDbBootstrapPrincipal } from "@bersoncare/db-principal";
import { requirePlatformOperationsApiContext } from "./requireRole";

const platform = {
  user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("requirePlatformOperationsApiContext", () => {
  beforeEach(() => getCurrentSessionMock.mockReset());

  it("allows only the finite platform capability and installs no-org principal", async () => {
    getCurrentSessionMock.mockResolvedValue(platform);
    await runWithDbBootstrapPrincipal({ source: "test" }, async () => {
      const result = await requirePlatformOperationsApiContext();
      expect(result.ok).toBe(true);
      expect(getCurrentDbPrincipal()).toMatchObject({ kind: "platform", platformUserId: platform.user.userId });
    });
  });

  it.each([
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
});
