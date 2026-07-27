import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const { enqueueIntegratorPushMock, enqueuePlatformSystemSettingsPushMock, getCurrentDbPrincipalMock } = vi.hoisted(
  () => ({
    enqueueIntegratorPushMock: vi.fn().mockResolvedValue(undefined),
    enqueuePlatformSystemSettingsPushMock: vi.fn().mockResolvedValue(undefined),
    getCurrentDbPrincipalMock: vi.fn(),
  }),
);

vi.stubGlobal("fetch", fetchMock);

vi.mock("@/infra/integrator-push/integratorPushOutbox", () => ({
  enqueueIntegratorPush: enqueueIntegratorPushMock,
  enqueuePlatformSystemSettingsPush: enqueuePlatformSystemSettingsPushMock,
}));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentCorrelationIdHeader: vi.fn(() => ({})),
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
}));

import { normalizeStoredValueJsonForIntegratorSync, syncSettingToIntegrator } from "./syncToIntegrator";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorApiUrl: vi.fn().mockResolvedValue("https://integrator.example"),
  getIntegratorWebhookSecret: vi.fn().mockResolvedValue("test-shared-secret-16chars"),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

describe("normalizeStoredValueJsonForIntegratorSync", () => {
  it("wraps primitive values", () => {
    expect(normalizeStoredValueJsonForIntegratorSync("MSK")).toEqual({ value: "MSK" });
  });

  it("passes through { value } objects", () => {
    expect(normalizeStoredValueJsonForIntegratorSync({ value: "Europe/Moscow" })).toEqual({
      value: "Europe/Moscow",
    });
  });
});

describe("syncSettingToIntegrator", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });
    enqueueIntegratorPushMock.mockClear();
    enqueuePlatformSystemSettingsPushMock.mockClear();
    getCurrentDbPrincipalMock.mockReturnValue(undefined);
  });

  it("POSTs signed body to integrator settings/sync", async () => {
    await syncSettingToIntegrator({
      key: "app_display_timezone",
      scope: "admin",
      valueJson: { value: "Europe/Samara" },
      updatedBy: "u1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrator.example/api/integrator/settings/sync");
    expect(init.method).toBe("POST");
	    const body = JSON.parse(init.body as string);
	    expect(body).toEqual({
	      key: "app_display_timezone",
	      scope: "admin",
	      organizationId: null,
	      valueJson: { value: "Europe/Samara" },
	      updatedBy: "u1",
	    });
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(typeof (init.headers as Record<string, string>)["x-bersoncare-timestamp"]).toBe("string");
    expect(typeof (init.headers as Record<string, string>)["x-bersoncare-signature"]).toBe("string");
  });

  it("enqueues outbox when integrator returns non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "bad" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncSettingToIntegrator({
      key: "dev_mode",
      scope: "admin",
      valueJson: { value: false },
    });
    expect(enqueueIntegratorPushMock).toHaveBeenCalledTimes(1);
	    expect(enqueueIntegratorPushMock.mock.calls[0]![1]).toMatchObject({
	      kind: "system_settings_sync",
	      idempotencyKey: "settings:global:admin:dev_mode",
	      payload: { key: "dev_mode", scope: "admin", organizationId: null, valueJson: { value: false } },
	    });
	    warnSpy.mockRestore();
	  });

  it("enqueues the SaaS billing provider setting through the closed fallback after an HTTP failure", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "platform",
      platformUserId: "77777777-7777-4777-8777-777777777777",
    });
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "bad" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await syncSettingToIntegrator({
      key: "saas_billing_payment_provider",
      scope: "admin",
      organizationId: null,
      valueJson: { value: { defaultProviderId: "mock" } },
      updatedBy: "77777777-7777-4777-8777-777777777777",
    });

    expect(enqueuePlatformSystemSettingsPushMock).toHaveBeenCalledWith({
      key: "saas_billing_payment_provider",
    });
    expect(enqueueIntegratorPushMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("includes organizationId in signed body and outbox idempotency", async () => {
    await syncSettingToIntegrator({
      key: "support_contact_url",
      scope: "admin",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      valueJson: { value: "https://org.example" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      key: "support_contact_url",
      scope: "admin",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, text: async () => "bad" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncSettingToIntegrator({
      key: "support_contact_url",
      scope: "admin",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      valueJson: { value: "https://org.example" },
    });
    expect(enqueueIntegratorPushMock.mock.calls[0]![1]).toMatchObject({
      idempotencyKey: "settings:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:admin:support_contact_url",
      payload: {
        key: "support_contact_url",
        scope: "admin",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    warnSpy.mockRestore();
  });
	});
