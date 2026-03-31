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

import { GET, POST } from "./route";

describe("/api/auth/logout", () => {
  it("POST clears session and redirects to /app", async () => {
    clearSessionMock.mockClear();
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/app$/);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it("GET clears session and redirects to /app", async () => {
    clearSessionMock.mockClear();
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "GET" });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/app$/);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});
