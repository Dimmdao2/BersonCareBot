import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardMock, listMock, updateMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  listMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({ requirePlatformOperationsApiContext: guardMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ systemSettings: { listSettingsByScope: listMock, updateSetting: updateMock } }),
}));

import { GET, PATCH } from "./route";

const platformSession = {
  user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("/api/platform/settings", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue({ ok: true, session: platformSession });
    listMock.mockReset().mockResolvedValue([]);
    updateMock.mockReset().mockImplementation(async (key: string, scope: string, valueJson: unknown, updatedBy: string) => ({
      key, scope, organizationId: null, valueJson, updatedAt: "", updatedBy,
    }));
  });

  it("keeps global reads on the platform surface with no organization context", async () => {
    await GET();
    expect(listMock).toHaveBeenCalledWith("admin", { organizationId: null });
  });

  it("writes a whitelisted global setting through the canonical service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "specialist_signup_enabled", value: true }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "specialist_signup_enabled", "admin", { value: true }, platformSession.user.userId, { organizationId: null },
    );
  });

  it("does not expose unwhitelisted restricted settings", async () => {
    listMock.mockResolvedValue([{ key: "max_bot_api_key", scope: "admin", organizationId: null, valueJson: { value: "secret" } }]);
    const body = await (await GET()).json();
    expect(body.settings).toEqual([]);
  });

  it("returns the guard's neutral denial without accessing settings", async () => {
    guardMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
});
