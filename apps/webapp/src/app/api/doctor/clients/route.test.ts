import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(),
}));

vi.mock("@/app-layer/doctor/createDoctorClient", () => ({
  createDoctorClient: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/doctor/clients", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
  });

  it("returns 403 for client role", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "c1", role: "client", displayName: "C", bindings: {} },
      issuedAt: 1,
      expiresAt: 9e9,
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+79990000001" }),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "forbidden" });
  });
});
