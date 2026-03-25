import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listSettingsByScopeMock, updateSettingMock, getSettingMock, buildAppDepsMock } =
  vi.hoisted(() => {
    const listSettingsByScopeMockInner = vi.fn().mockResolvedValue([]);
    const updateSettingMockInner = vi.fn().mockResolvedValue({
      key: "patient_label",
      scope: "doctor",
      valueJson: { value: "пациент" },
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

describe("GET /api/doctor/settings", () => {
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

  it("returns 200 for doctor role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    listSettingsByScopeMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 200 for admin role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    listSettingsByScopeMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/doctor/settings", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateSettingMock.mockReset();
    getSettingMock.mockReset();
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_label", value: { value: "клиент" } }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid key", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "totally_invalid_key", value: true }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for admin scope key via doctor endpoint", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dev_mode", value: true }),
      })
    );
    // dev_mode not in doctor scope keys → 400
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid doctor key", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    updateSettingMock.mockResolvedValue({
      key: "patient_label",
      scope: "doctor",
      valueJson: { value: "клиент" },
      updatedAt: "",
      updatedBy: "d1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_label", value: { value: "клиент" } }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 for admin role patching doctor scope key", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    updateSettingMock.mockResolvedValue({
      key: "patient_label",
      scope: "doctor",
      valueJson: { value: "пациент" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_label", value: { value: "пациент" } }),
      })
    );
    expect(res.status).toBe(200);
  });
});
