import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardMock, listMock, updateMock, channelPolicyMock, oauthProviderPolicyMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  listMock: vi.fn(),
  updateMock: vi.fn(),
  channelPolicyMock: vi.fn(),
  oauthProviderPolicyMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({ requirePlatformOperationsApiContext: guardMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ systemSettings: { listSettingsByScope: listMock, updateSetting: updateMock } }),
}));
vi.mock("@/modules/auth/authChannelPolicy", () => ({
  getAuthChannelPolicyDetail: channelPolicyMock,
  getOAuthProviderPolicyDetail: oauthProviderPolicyMock,
}));

import { GET, PATCH } from "./route";
import { DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY } from "@/modules/system-settings/platformIntegrationAvailability";

const platformSession = {
  user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("/api/platform/settings", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue({ ok: true, session: platformSession });
    listMock.mockReset().mockResolvedValue([]);
    updateMock.mockReset().mockImplementation(async (key: string, scope: string, valueJson: unknown, updatedBy: string) => ({
      key, scope, organizationId: null, valueJson, updatedAt: "", updatedBy,
    }));
    channelPolicyMock.mockReset().mockResolvedValue({
      email: { enabled: true, configured: true },
      sms: { enabled: false, configured: false },
      telegram: { enabled: true, configured: true },
      max: { enabled: true, configured: true },
    });
    oauthProviderPolicyMock.mockReset().mockResolvedValue({
      google: { enabled: true, configured: false },
      yandex: { enabled: true, configured: true },
    });
  });

  it("keeps global reads on the platform surface with no organization context", async () => {
    await GET();
    expect(listMock).toHaveBeenCalledWith("admin", { organizationId: null });
  });

  it("writes a whitelisted global setting through the canonical service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "specialist_signup_enabled", value: true }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "specialist_signup_enabled", "admin", { value: true }, platformSession.user.userId, { organizationId: null },
    );
  });

  it("returns the computed channel and OAuth-provider configuration status alongside settings", async () => {
    const body = await (await GET()).json();
    expect(body.channelPolicy).toEqual({
      email: { enabled: true, configured: true },
      sms: { enabled: false, configured: false },
      telegram: { enabled: true, configured: true },
      max: { enabled: true, configured: true },
    });
    expect(body.oauthProviderPolicy).toEqual({
      google: { enabled: true, configured: false },
      yandex: { enabled: true, configured: true },
    });
  });

  it.each([
    "auth_email_enabled",
    "auth_sms_enabled",
    "auth_telegram_enabled",
    "auth_max_enabled",
    "auth_oauth_google_enabled",
    "auth_oauth_yandex_enabled",
    "auth_2fa_enabled",
  ])("writes the %s policy only as a global admin boolean", async (key) => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: false }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      key, "admin", { value: false }, platformSession.user.userId, { organizationId: null },
    );
  });

  it("writes the unsupported-client fallback only as a global admin boolean", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "patient_unsupported_client_fallback_enabled", value: true }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "patient_unsupported_client_fallback_enabled", "admin", { value: true },
      platformSession.user.userId, { organizationId: null },
    );
  });

  it("writes normalized global-admin email allowlists only through the platform service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_emails", value: [" DimmDao@Gmail.com "] }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "admin_emails", "admin", { value: ["dimmdao@gmail.com"] },
      platformSession.user.userId, { organizationId: null },
    );
  });

  it("rejects malformed or duplicate global-admin emails before the service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_emails", value: ["not-an-email", "not-an-email"] }),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean auth-channel value before the service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "auth_sms_enabled", value: "true" }),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes the exact versioned platform integration availability shape", async () => {
    const value = {
      ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY,
      integrations: {
        ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations,
        telegram: false,
      },
    };
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "platform_integration_availability", value }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "platform_integration_availability", "admin", { value },
      platformSession.user.userId, { organizationId: null },
    );
  });

  it("rejects incomplete platform integration availability before the service", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "platform_integration_availability",
        value: { version: 1, integrations: { telegram: true } },
      }),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("normalizes and writes the structured location palette globally", async () => {
    const value = {
      physicalPalette: ["#123abc", "#223344", "#334455", "#445566", "#556677"],
      online: "#abcdef",
    };
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "booking_location_default_palette", value }),
    }));
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      "booking_location_default_palette",
      "admin",
      { value: { ...value, physicalPalette: value.physicalPalette.map((color) => color.toUpperCase()), online: "#ABCDEF" } },
      platformSession.user.userId,
      { organizationId: null },
    );
  });

  it("rejects a short or invalid location palette", async () => {
    const response = await PATCH(new Request("http://localhost/api/platform/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "booking_location_default_palette",
        value: { physicalPalette: ["#111111", "#222222"], online: "#333333" },
      }),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not expose unwhitelisted restricted settings", async () => {
    listMock.mockResolvedValue([{ key: "max_bot_api_key", scope: "admin", organizationId: null, valueJson: { value: "secret" } }]);
    const body = await (await GET()).json();
    expect(body.settings).toEqual([]);
  });

  it("returns the guard's neutral denial without accessing settings", async () => {
    guardMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
});
