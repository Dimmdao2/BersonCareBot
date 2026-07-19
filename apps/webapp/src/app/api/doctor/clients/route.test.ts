import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
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
    requireDoctorWorkspaceApiContextMock.mockReset();
  });

  it("returns 403 for client role", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
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
