import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, fn: () => unknown) => fn()),
);
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getAppDisplayTimeZoneMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: () => getAppDisplayTimeZoneMock(),
}));

import { GET } from "./route";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";

describe("GET /api/doctor/proactive-insights/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppDisplayTimeZoneMock.mockResolvedValue("Europe/Moscow");
  });

  it("returns the workspace gate response without reading insights", async () => {
    const queryInsights = vi.fn();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    buildAppDepsMock.mockReturnValue({ doctorProactiveInsights: { queryInsights } });

    const response = await GET(new Request("http://localhost"));

    expect(response.status).toBe(401);
    expect(queryInsights).not.toHaveBeenCalled();
    expect(getAppDisplayTimeZoneMock).not.toHaveBeenCalled();
  });

  it.each([
    [ORG_A, 4],
    [ORG_B, 0],
  ])("scopes the count to workspace %s", async (organizationId, totalCount) => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "doctor-1", role: "doctor" } },
      },
    });
    const queryInsights = vi.fn().mockResolvedValue({ items: [], totalCount });
    buildAppDepsMock.mockReturnValue({ doctorProactiveInsights: { queryInsights } });

    const response = await GET(new Request("http://localhost"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, count: totalCount });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(queryInsights).toHaveBeenCalledWith({
      limit: 1,
      displayIana: "Europe/Moscow",
      organizationId,
    });
  });
});
