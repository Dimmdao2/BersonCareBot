import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listSettingsByScopeMock, updateSettingMock, getSettingMock, buildAppDepsMock } =
  vi.hoisted(() => {
    const listSettingsByScopeMockInner = vi.fn().mockResolvedValue([]);
    const updateSettingMockInner = vi.fn().mockResolvedValue({
      key: "dev_mode",
      scope: "admin",
      valueJson: { value: false },
      updatedAt: "",
      updatedBy: null,
    });
    const getSettingMockInner = vi.fn().mockResolvedValue(null);
    return {
      getSessionMock: vi.fn(),
      listSettingsByScopeMock: listSettingsByScopeMockInner,
      updateSettingMock: updateSettingMockInner,
      getSettingMock: getSettingMockInner,
      buildAppDepsMock: vi.fn(() => ({
        systemSettings: {
          listSettingsByScope: listSettingsByScopeMockInner,
          updateSetting: updateSettingMockInner,
          getSetting: getSettingMockInner,
        },
      })),
    };
  });

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));

import { GET, PATCH } from "./route";

describe("GET /api/admin/settings", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listSettingsByScopeMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for doctor role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    listSettingsByScopeMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/settings", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateSettingMock.mockReset();
    getSettingMock.mockReset();
  });

  it("returns 403 for doctor role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dev_mode", value: true }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid key", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_label", value: "something" }),
      })
    );
    // patient_label not in admin scope keys → 400
    expect(res.status).toBe(400);
  });

  it("returns 200 for admin updating dev_mode", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "dev_mode",
      scope: "admin",
      valueJson: { value: true },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dev_mode", value: true }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("записывает updated_by из сессии при PATCH", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "admin-uuid", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "dev_mode",
      scope: "admin",
      valueJson: { value: false },
      updatedAt: "",
      updatedBy: "admin-uuid",
    });
    await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dev_mode", value: false }),
      })
    );
    expect(updateSettingMock).toHaveBeenCalledWith("dev_mode", "admin", { value: false }, "admin-uuid");
  });

  it("returns 401 when no session on PATCH", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dev_mode", value: false }),
      })
    );
    expect(res.status).toBe(401);
  });
});
