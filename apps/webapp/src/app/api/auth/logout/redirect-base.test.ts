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

vi.mock("@/config/env", () => ({
  env: {
    APP_BASE_URL: "https://webapp.redirect.test",
  },
}));

import { POST } from "./route";

describe("/api/auth/logout redirect base", () => {
  it("POST redirect uses APP_BASE_URL origin", async () => {
    clearSessionMock.mockClear();
    const req = new NextRequest("http://127.0.0.1:6200/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://webapp.redirect.test/app");
  });
});
