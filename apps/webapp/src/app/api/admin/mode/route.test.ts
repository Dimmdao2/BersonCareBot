import { describe, it, expect, vi, beforeEach } from "vitest";

const { platformGateMock, toggleAdminModeMock } = vi.hoisted(() => ({
  platformGateMock: vi.fn(),
  toggleAdminModeMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  toggleAdminMode: toggleAdminModeMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: platformGateMock,
}));

import { POST } from "./route";

describe("POST /api/admin/mode", () => {
  beforeEach(() => {
    platformGateMock.mockReset();
    toggleAdminModeMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    platformGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the platform guard rejects a foreign audience", async () => {
    platformGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(toggleAdminModeMock).not.toHaveBeenCalled();
  });

  it("returns 200 and toggles adminMode for admin", async () => {
    platformGateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" }, adminMode: true },
    });
    toggleAdminModeMock.mockResolvedValue({ ok: true, adminMode: true });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; adminMode: boolean };
    expect(body.ok).toBe(true);
    expect(body.adminMode).toBe(true);
  });
});
