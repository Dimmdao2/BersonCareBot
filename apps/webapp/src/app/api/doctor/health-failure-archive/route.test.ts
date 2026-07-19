import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, listForDoctorMock, buildAppDepsMock } = vi.hoisted(() => {
  const requireAdminModeSessionMock = vi.fn();
  const listForDoctorMock = vi.fn();
  const buildAppDepsMock = vi.fn(() => ({
    healthFailureArchive: {
      listForDoctor: listForDoctorMock,
    },
  }));
  return { requireAdminModeSessionMock, listForDoctorMock, buildAppDepsMock };
});

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/health-failure-archive", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    listForDoctorMock.mockReset();
    buildAppDepsMock.mockClear();
  });

  it("does not read platform data when the platform guard denies", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/health-failure-archive"));
    expect(res.status).toBe(403);
    expect(listForDoctorMock).not.toHaveBeenCalled();
  });

  it("filters by the explicit platform operator", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "adm-uuid-1", role: "admin" }, adminMode: true },
    });
    listForDoctorMock.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(new Request("http://localhost/api/doctor/health-failure-archive"));
    expect(res.status).toBe(200);
    expect(listForDoctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ doctorUserId: "adm-uuid-1" }),
    );
  });
});
