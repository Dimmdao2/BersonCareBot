import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSessionMock, listForDoctorMock, buildAppDepsMock } = vi.hoisted(() => {
  const getCurrentSessionMock = vi.fn();
  const listForDoctorMock = vi.fn();
  const buildAppDepsMock = vi.fn(() => ({
    healthFailureArchive: {
      listForDoctor: listForDoctorMock,
    },
  }));
  return { getCurrentSessionMock, listForDoctorMock, buildAppDepsMock };
});

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/health-failure-archive", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    listForDoctorMock.mockReset();
    buildAppDepsMock.mockClear();
  });

  it("returns 401 without session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/health-failure-archive"));
    expect(res.status).toBe(401);
    expect(listForDoctorMock).not.toHaveBeenCalled();
  });

  it("returns 403 for patient role", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "c1", role: "client" } });
    const res = await GET(new Request("http://localhost/api/doctor/health-failure-archive"));
    expect(res.status).toBe(403);
  });

  it("filters by session userId for admin as for doctor", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "adm-uuid-1", role: "admin" } });
    listForDoctorMock.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(new Request("http://localhost/api/doctor/health-failure-archive"));
    expect(res.status).toBe(200);
    expect(listForDoctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ doctorUserId: "adm-uuid-1" }),
    );
  });
});
