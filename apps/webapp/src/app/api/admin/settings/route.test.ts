import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_KEYS } from "@/modules/system-settings/types";

const {
  getSessionMock,
  listSettingsByScopeMock,
  updateSettingMock,
  getSettingMock,
  buildAppDepsMock,
  listTopicsMock,
  persistAdminModesBatchMock,
} = vi.hoisted(() => {
  const listSettingsByScopeMockInner = vi.fn().mockResolvedValue([]);
  const updateSettingMockInner = vi.fn().mockResolvedValue({
    key: "dev_mode",
    scope: "admin",
    valueJson: { value: false },
    updatedAt: "",
    updatedBy: null,
  });
  const getSettingMockInner = vi.fn().mockResolvedValue(null);
  const listTopicsMockInner = vi.fn().mockResolvedValue([]);
  const persistAdminModesBatchMockInner = vi.fn().mockImplementation(
    async (rows: { key: string; valueJson: unknown }[]) =>
      rows.map((r) => ({
        key: r.key,
        scope: "admin",
        valueJson: r.valueJson,
        updatedAt: "",
        updatedBy: "a1",
      })),
  );
  return {
    getSessionMock: vi.fn(),
    listSettingsByScopeMock: listSettingsByScopeMockInner,
    updateSettingMock: updateSettingMockInner,
    getSettingMock: getSettingMockInner,
    listTopicsMock: listTopicsMockInner,
    persistAdminModesBatchMock: persistAdminModesBatchMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: {
        listSettingsByScope: listSettingsByScopeMockInner,
        updateSetting: updateSettingMockInner,
        getSetting: getSettingMockInner,
        persistAdminModesBatch: persistAdminModesBatchMockInner,
      },
      subscriptionMailingProjection: {
        listTopics: listTopicsMockInner,
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

  it("includes patient_home_mood_icons for webapp whitelist", () => {
    expect(ALLOWED_KEYS).toContain("patient_home_mood_icons");
  });

  it("includes Phase 8 morning ping keys", () => {
    expect(ALLOWED_KEYS).toContain("patient_home_morning_ping_enabled");
    expect(ALLOWED_KEYS).toContain("patient_home_morning_ping_local_time");
  });

  it("includes patient maintenance keys", () => {
    expect(ALLOWED_KEYS).toContain("patient_app_maintenance_enabled");
    expect(ALLOWED_KEYS).toContain("patient_app_maintenance_message");
    expect(ALLOWED_KEYS).toContain("test_account_identifiers");
    expect(ALLOWED_KEYS).toContain("patient_booking_url");
  });

  it("includes notifications_topics for webapp whitelist", () => {
    expect(ALLOWED_KEYS).toContain("notifications_topics");
  });
});

describe("PATCH /api/admin/settings", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateSettingMock.mockReset();
    getSettingMock.mockReset();
    listTopicsMock.mockReset();
    listTopicsMock.mockResolvedValue([]);
    persistAdminModesBatchMock.mockReset();
    persistAdminModesBatchMock.mockImplementation(async (rows: { key: string; valueJson: unknown }[]) =>
      rows.map((r) => ({
        key: r.key,
        scope: "admin",
        valueJson: r.valueJson,
        updatedAt: "",
        updatedBy: "a1",
      })),
    );
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

  it("returns 200 for patient_home_mood_icons with five scores sorted on save", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_home_mood_icons",
      scope: "admin",
      valueJson: { value: [] },
      updatedAt: "",
      updatedBy: "a1",
    });
    const body = {
      key: "patient_home_mood_icons",
      value: {
        value: [
          { score: 5, label: "E", imageUrl: "/api/media/e" },
          { score: 1, label: "A", imageUrl: null },
          { score: 3, label: "C", imageUrl: "/api/media/c" },
          { score: 2, label: "B", imageUrl: null },
          { score: 4, label: "D", imageUrl: "/api/media/d" },
        ],
      },
    };
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_mood_icons",
      "admin",
      {
        value: [
          { score: 1, label: "A", imageUrl: null },
          { score: 2, label: "B", imageUrl: null },
          { score: 3, label: "C", imageUrl: "/api/media/c" },
          { score: 4, label: "D", imageUrl: "/api/media/d" },
          { score: 5, label: "E", imageUrl: "/api/media/e" },
        ],
      },
      "a1",
    );
  });

  it("returns 400 for patient_home_mood_icons wrong array length", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_home_mood_icons",
          value: {
            value: [
              { score: 1, label: "A", imageUrl: null },
              { score: 2, label: "B", imageUrl: null },
            ],
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for patient_home_mood_icons duplicate score", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_home_mood_icons",
          value: {
            value: [
              { score: 1, label: "A", imageUrl: null },
              { score: 1, label: "B", imageUrl: null },
              { score: 3, label: "C", imageUrl: null },
              { score: 4, label: "D", imageUrl: null },
              { score: 5, label: "E", imageUrl: null },
            ],
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for patient_home_mood_icons invalid imageUrl", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_home_mood_icons",
          value: {
            value: [
              { score: 1, label: "A", imageUrl: "https://evil.example/a.png" },
              { score: 2, label: "B", imageUrl: null },
              { score: 3, label: "C", imageUrl: null },
              { score: 4, label: "D", imageUrl: null },
              { score: 5, label: "E", imageUrl: null },
            ],
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for notifications_topics when projection empty (structural only)", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    listTopicsMock.mockResolvedValue([]);
    updateSettingMock.mockResolvedValue({
      key: "notifications_topics",
      scope: "admin",
      valueJson: { value: [{ id: "alpha", title: "Alpha" }] },
      updatedAt: "",
      updatedBy: "a1",
    });
    const value = [{ id: "alpha", title: "Alpha" }];
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "notifications_topics", value: { value } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("notifications_topics", "admin", { value }, "a1");
  });

  it("returns 200 for notifications_topics when ids are subset of projection codes", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    listTopicsMock.mockResolvedValue([
      {
        integratorTopicId: "1",
        code: "news",
        title: "News",
        key: "news",
        isActive: true,
      },
      {
        integratorTopicId: "2",
        code: "symptom_reminders",
        title: "Symptoms",
        key: "symptom_reminders",
        isActive: true,
      },
    ]);
    updateSettingMock.mockResolvedValue({
      key: "notifications_topics",
      scope: "admin",
      valueJson: { value: [{ id: "news", title: "Новости" }] },
      updatedAt: "",
      updatedBy: "a1",
    });
    const value = [{ id: "news", title: "Новости" }];
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "notifications_topics", value: { value } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("notifications_topics", "admin", { value }, "a1");
  });

  it("returns 400 for notifications_topics when id unknown and projection non-empty", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    listTopicsMock.mockResolvedValue([
      {
        integratorTopicId: "1",
        code: "news",
        title: "News",
        key: "news",
        isActive: true,
      },
    ]);
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "notifications_topics",
          value: { value: [{ id: "not_in_projection", title: "X" }] },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for notifications_topics duplicate ids", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    listTopicsMock.mockResolvedValue([]);
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "notifications_topics",
          value: {
            value: [
              { id: "a", title: "A" },
              { id: "a", title: "B" },
            ],
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for patient_app_maintenance_enabled", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_app_maintenance_enabled",
      scope: "admin",
      valueJson: { value: true },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_app_maintenance_enabled", value: { value: true } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_app_maintenance_enabled",
      "admin",
      { value: true },
      "a1",
    );
  });

  it("returns 400 for patient_app_maintenance_enabled invalid", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_app_maintenance_enabled", value: { value: "nope" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for patient_app_maintenance_message too long", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_app_maintenance_message",
          value: { value: "x".repeat(501) },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for test_account_identifiers with normalized deduped arrays", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "test_account_identifiers",
      scope: "admin",
      valueJson: {
        value: {
          phones: ["+79990000001"],
          telegramIds: ["111", "222"],
          maxIds: ["m1"],
        },
      },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "test_account_identifiers",
          value: {
            value: {
              phones: ["+7 999 000 00 01", "+79990000001", "not-a-phone"],
              telegramIds: [" 111 ", "222", "222"],
              maxIds: ["m1", ""],
              extraField: "ignored",
            },
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "test_account_identifiers",
      "admin",
      {
        value: {
          phones: ["+79990000001"],
          telegramIds: ["111", "222"],
          maxIds: ["m1"],
        },
      },
      "a1",
    );
  });

  it("returns 400 for test_account_identifiers invalid top-level shape", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "test_account_identifiers",
          value: { value: [] },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for video_default_delivery invalid enum", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "video_default_delivery", value: { value: "youtube" } }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.error).toBe("invalid_value");
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for video_default_delivery and normalizes to lowercase", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "video_default_delivery",
      scope: "admin",
      valueJson: { value: "hls" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "video_default_delivery", value: "  HLS  " }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("video_default_delivery", "admin", { value: "hls" }, "a1");
  });

  it.each([
    ["video_playback_api_enabled", true],
    ["video_hls_pipeline_enabled", false],
    ["video_hls_new_uploads_auto_transcode", true],
  ] as const)("returns 200 for %s boolean PATCH", async (key, val) => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key,
      scope: "admin",
      valueJson: { value: val },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: { value: val } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(key, "admin", { value: val }, "a1");
  });

  it("returns 400 for video_playback_api_enabled invalid value", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "video_playback_api_enabled",
          value: { value: "maybe" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("returns 200 for patient_home_morning_ping_enabled via coerce helper", async () => {
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
        body: JSON.stringify({
          key: "patient_home_morning_ping_enabled",
          value: { value: 1 },
        }),
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

  it("returns 200 for patient_booking_url https", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_booking_url",
      scope: "admin",
      valueJson: { value: "https://example.com/z" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_booking_url",
          value: { value: "https://example.com/z" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("patient_booking_url", "admin", { value: "https://example.com/z" }, "a1");
  });

  it("returns 200 for patient_booking_url empty (reset to runtime default)", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    updateSettingMock.mockResolvedValue({
      key: "patient_booking_url",
      scope: "admin",
      valueJson: { value: "" },
      updatedAt: "",
      updatedBy: "a1",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "patient_booking_url", value: { value: "" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith("patient_booking_url", "admin", { value: "" }, "a1");
  });

  it("returns 400 for patient_booking_url invalid protocol", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "patient_booking_url",
          value: { value: "ftp://example.com" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("batch: returns 200 and calls persistAdminModesBatch (not updateSetting)", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getSettingMock.mockResolvedValue(null);
    const items = [
      { key: "dev_mode", value: { value: false } },
      { key: "debug_forward_to_admin", value: { value: true } },
    ];
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; settings?: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.settings)).toBe(true);
    expect(persistAdminModesBatchMock).toHaveBeenCalledTimes(1);
    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(persistAdminModesBatchMock).toHaveBeenCalledWith(
      [
        { key: "dev_mode", valueJson: { value: false } },
        { key: "debug_forward_to_admin", valueJson: { value: true } },
      ],
      "a1",
    );
  });

  it("batch: returns 400 empty_batch for items: []", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.error).toBe("empty_batch");
    expect(persistAdminModesBatchMock).not.toHaveBeenCalled();
  });

  it("batch: returns 400 duplicate_key_in_batch", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { key: "dev_mode", value: { value: false } },
            { key: "dev_mode", value: { value: true } },
          ],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string; atIndex?: number };
    expect(body.error).toBe("duplicate_key_in_batch");
    expect(body.atIndex).toBe(1);
    expect(persistAdminModesBatchMock).not.toHaveBeenCalled();
  });

  it("batch: returns 400 ambiguous_body when key and items both present", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "dev_mode",
          value: true,
          items: [{ key: "dev_mode", value: { value: false } }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.error).toBe("ambiguous_body");
  });

  it("batch: returns 400 invalid_value with atIndex for bad integrator_linked_phone_source", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { key: "dev_mode", value: { value: false } },
            { key: "integrator_linked_phone_source", value: { value: "bad" } },
          ],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string; atIndex?: number; key?: string };
    expect(body.error).toBe("invalid_value");
    expect(body.atIndex).toBe(1);
    expect(body.key).toBe("integrator_linked_phone_source");
    expect(persistAdminModesBatchMock).not.toHaveBeenCalled();
  });
});
