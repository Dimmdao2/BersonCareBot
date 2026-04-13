import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const enqueueIntegratorPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.stubGlobal("fetch", fetchMock);

vi.mock("@/infra/integrator-push/integratorPushOutbox", () => ({
  enqueueIntegratorPush: enqueueIntegratorPushMock,
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
      idempotencyKey: "settings:admin:dev_mode",
      payload: { key: "dev_mode", scope: "admin", valueJson: { value: false } },
    });
    warnSpy.mockRestore();
  });
});
