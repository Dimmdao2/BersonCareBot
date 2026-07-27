import { describe, expect, it, vi } from "vitest";
import {
  getWebPushVapidKeyPair,
  redactAdminSettingsForClient,
  redactWebPushVapidSettingForClient,
} from "./webPushVapidRuntime";
import type { SystemSetting } from "./types";

describe("getWebPushVapidKeyPair", () => {
  it("returns null when setting missing", async () => {
    const getSetting = vi.fn().mockResolvedValue(null);
    expect(await getWebPushVapidKeyPair({ getSetting })).toBeNull();
    expect(getSetting).toHaveBeenCalledWith("web_push_vapid", "admin");
  });

  it("returns null when private empty", async () => {
    const getSetting = vi.fn().mockResolvedValue({
      key: "web_push_vapid",
      scope: "admin",
      valueJson: { value: { publicKey: "ab", privateKey: "" } },
      updatedAt: "",
      updatedBy: null,
    });
    expect(await getWebPushVapidKeyPair({ getSetting })).toBeNull();
  });

  it("returns pair when both set", async () => {
    const getSetting = vi.fn().mockResolvedValue({
      key: "web_push_vapid",
      scope: "admin",
      valueJson: { value: { publicKey: "pubX", privateKey: "privY" } },
      updatedAt: "",
      updatedBy: null,
    });
    expect(await getWebPushVapidKeyPair({ getSetting })).toEqual({ publicKey: "pubX", privateKey: "privY" });
  });
});

describe("redactWebPushVapidSettingForClient", () => {
  it("replaces privateKey with hasPrivateKey", () => {
    const row: SystemSetting = {
      key: "web_push_vapid",
      scope: "admin",
      valueJson: { value: { publicKey: "pubA", privateKey: "secretZ" } },
      updatedAt: "",
      updatedBy: null,
    };
    expect(redactWebPushVapidSettingForClient(row).valueJson).toEqual({
      value: { publicKey: "pubA", hasPrivateKey: true },
    });
  });

  it("redactAdminSettingsForClient only touches web_push_vapid", () => {
    const rows: SystemSetting[] = [
      {
        key: "dev_mode",
        scope: "admin",
        valueJson: { value: true },
        updatedAt: "",
        updatedBy: null,
      },
      {
        key: "web_push_vapid",
        scope: "admin",
        valueJson: { value: { publicKey: "p", privateKey: "x" } },
        updatedAt: "",
        updatedBy: null,
      },
    ];
    const out = redactAdminSettingsForClient(rows);
    expect(out[0]).toEqual(rows[0]);
    expect(out[1]?.valueJson).toEqual({ value: { publicKey: "p", hasPrivateKey: true } });
  });

  it("never returns the SMSC credential to browser-facing admin settings", () => {
    const out = redactAdminSettingsForClient([
      {
        key: "smsc_api_key",
        scope: "admin",
        valueJson: { value: "private-smsc-key" },
        updatedAt: "2026-07-22T00:00:00.000Z",
        updatedBy: null,
      },
    ]);
    expect(out[0]?.valueJson).toEqual({ value: "[REDACTED]" });
    expect(JSON.stringify(out)).not.toContain("private-smsc-key");
  });

  it("returns only a configured marker for the VK ID client secret", () => {
    const configuredMarker = "vk-secret-configured";
    const out = redactAdminSettingsForClient([
      {
        key: "vk_id_client_secret",
        scope: "admin",
        valueJson: { value: configuredMarker },
        updatedAt: "",
        updatedBy: null,
      },
    ]);
    expect(out[0]?.valueJson).toEqual({ value: { hasStoredSecret: true } });
    expect(JSON.stringify(out)).not.toContain(configuredMarker);
  });

  it("never returns the error tracking DSN to browser-facing settings", () => {
    const out = redactAdminSettingsForClient([{
      key: "error_tracking_dsn",
      scope: "admin",
      valueJson: { value: "https://public@example.test/1" },
      updatedAt: "",
      updatedBy: null,
    }]);
    expect(out[0]?.valueJson).toEqual({ value: { hasStoredDsn: true } });
    expect(JSON.stringify(out)).not.toContain("example.test");
  });

  it("never serializes VAPID secret fields", () => {
    const out = redactAdminSettingsForClient([
      {
        key: "web_push_vapid",
        scope: "admin",
        valueJson: { value: { publicKey: "p", privateKey: "private", refreshToken: "nope" } },
        updatedAt: "",
        updatedBy: null,
      },
    ]);
    const serialized = JSON.stringify(out);
    for (const secretField of ["privateKey", "password", "apiKey", "webhookSecret", "refreshToken"]) {
      expect(serialized).not.toContain(secretField);
    }
  });

  it("redacts the separate global SaaS provider envelope", () => {
    const out = redactAdminSettingsForClient([{
      key: "saas_billing_payment_provider",
      scope: "admin",
      valueJson: {
        value: {
          defaultProviderId: "mock",
          providers: [{
            id: "mock",
            label: "Mock",
            enabled: true,
            apiKey: "configured-marker",
            webhookSecret: "configured-webhook-marker",
          }],
        },
      },
      updatedAt: "",
      updatedBy: null,
    }]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("configured-marker");
    expect(serialized).not.toContain("configured-webhook-marker");
    expect(serialized).toContain("[REDACTED]");
  });
});
