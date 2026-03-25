import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, toggleAdminModeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  toggleAdminModeMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
  toggleAdminMode: toggleAdminModeMock,
}));

import { POST } from "./route";

describe("POST /api/admin/mode", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    toggleAdminModeMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 200 and toggles adminMode for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} }, adminMode: false });
    toggleAdminModeMock.mockResolvedValue({ ok: true, adminMode: true });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; adminMode: boolean };
    expect(body.ok).toBe(true);
    expect(body.adminMode).toBe(true);
  });
});
