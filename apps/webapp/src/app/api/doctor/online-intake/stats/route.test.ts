import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationId = "10000000-0000-4000-8000-000000000001";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const getDoctorStatsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ total: 5, byStatus: {} }),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: () => ({
    getDoctorStats: getDoctorStatsMock,
  }),
}));

import { GET } from "./route";

function call(url: string) {
  return GET(new Request(url));
}

describe("GET /api/doctor/online-intake/stats", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "d1", role: "doctor", bindings: {}, displayName: "D" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getDoctorStatsMock.mockClear();
  });

  it("returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await call("http://localhost/api/doctor/online-intake/stats");
    expect(res.status).toBe(401);
    expect(getDoctorStatsMock).not.toHaveBeenCalled();
  });

  it("использует days=30 по умолчанию", async () => {
    const res = await call("http://localhost/api/doctor/online-intake/stats");
    expect(res.status).toBe(200);
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    const body = (await res.json()) as { ok: boolean; stats: unknown };
    expect(body.ok).toBe(true);
    expect(body.stats).toEqual({ total: 5, byStatus: {} });
  });

  it("принимает разрешённые окна (7/30/90/365)", async () => {
    await call("http://localhost/api/doctor/online-intake/stats?days=90");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(90);
  });

  it("откатывает невалидное окно к 30", async () => {
    await call("http://localhost/api/doctor/online-intake/stats?days=999");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);

    getDoctorStatsMock.mockClear();
    await call("http://localhost/api/doctor/online-intake/stats?days=abc");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);
  });
});
