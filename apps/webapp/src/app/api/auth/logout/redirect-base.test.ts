import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { clearSessionMock, buildAppDepsMock } = vi.hoisted(() => {
  const clearSessionMock = vi.fn().mockResolvedValue(undefined);
  return {
    clearSessionMock,
    buildAppDepsMock: vi.fn(() => ({
      auth: { clearSession: clearSessionMock },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { POST } from "./route";

describe("/api/auth/logout redirect base", () => {
  it("POST redirect uses request origin (not APP_BASE_URL)", async () => {
    clearSessionMock.mockClear();
    const req = new NextRequest("http://127.0.0.1:6200/api/auth/logout", {
      method: "POST",
      headers: { host: "127.0.0.1:6200" },
    });
    const res = await POST(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("http://127.0.0.1:6200/app");
  });

  it("POST redirect keeps localhost host when logout from localhost", async () => {
    clearSessionMock.mockClear();
    const req = new NextRequest("http://localhost:5200/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("http://localhost:5200/app");
  });
});
