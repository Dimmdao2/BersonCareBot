import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_KEYS } from "@/modules/system-settings/types";

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

describe("ALLOWED_KEYS / ADMIN scope (Phase 2)", () => {
  it("includes patient_home_daily_practice_target for webapp whitelist", () => {
    expect(ALLOWED_KEYS).toContain("patient_home_daily_practice_target");
  });

  it("includes Phase 8 morning ping keys", () => {
    expect(ALLOWED_KEYS).toContain("patient_home_morning_ping_enabled");
    expect(ALLOWED_KEYS).toContain("patient_home_morning_ping_local_time");
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

  it("returns 200 for admin updating max_debug_page_enabled (AdminSettingsSection body)", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "max_debug_page_enabled",
      scope: "admin",
      valueJson: { value: true },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "max_debug_page_enabled", value: { value: true } }),
      })
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("max_debug_page_enabled", "admin", { value: true }, "a1");
  });

  it("returns 200 for admin updating app_base_url", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "app_base_url",
      scope: "admin",
      valueJson: { value: "https://example.com" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "app_base_url", value: "https://example.com" }),
      })
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("app_base_url", "admin", { value: "https://example.com" }, "a1");
  });

  it("returns 200 for admin updating yandex_oauth_client_id (system_settings)", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "yandex_oauth_client_id",
      scope: "admin",
      valueJson: { value: "oauth-client-id" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "yandex_oauth_client_id", value: "oauth-client-id" }),
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

  it("returns 400 for invalid integrator_linked_phone_source string", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "integrator_linked_phone_source", value: { value: "not_a_mode" } }),
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_value");
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for integrator_linked_phone_source when value is not a string", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "integrator_linked_phone_source", value: { value: 1 } }),
      })
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 and trims integrator_linked_phone_source for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "integrator_linked_phone_source",
      scope: "admin",
      valueJson: { value: "public_only" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "integrator_linked_phone_source",
          value: { value: "  public_only  " },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "integrator_linked_phone_source",
      "admin",
      { value: "public_only" },
      "a1",
    );
  });

  it("accepts integrator_linked_phone_source as bare string value", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "integrator_linked_phone_source",
      scope: "admin",
      valueJson: { value: "contacts_only" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "integrator_linked_phone_source", value: "contacts_only" }),
      })
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "integrator_linked_phone_source",
      "admin",
      { value: "contacts_only" },
      "a1",
    );
  });

  it("returns 200 for patient_home_daily_practice_target in range", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_home_daily_practice_target",
      scope: "admin",
      valueJson: { value: 6 },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_home_daily_practice_target", value: { value: 6 } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_daily_practice_target",
      "admin",
      { value: 6 },
      "a1",
    );
  });

  it("returns 400 for patient_home_daily_practice_target out of range", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_home_daily_practice_target", value: { value: 11 } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for patient_home_morning_ping_enabled boolean", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_home_morning_ping_enabled",
      scope: "admin",
      valueJson: { value: true },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_home_morning_ping_enabled", value: { value: true } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_morning_ping_enabled",
      "admin",
      { value: true },
      "a1",
    );
  });

  it("returns 200 for patient_home_morning_ping_local_time HH:MM", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_home_morning_ping_local_time",
      scope: "admin",
      valueJson: { value: "09:30" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_home_morning_ping_local_time",
          value: { value: "9:30" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_morning_ping_local_time",
      "admin",
      { value: "09:30" },
      "a1",
    );
  });

  it("returns 400 for patient_home_morning_ping_local_time invalid", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_home_morning_ping_local_time",
          value: { value: "25:00" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});
