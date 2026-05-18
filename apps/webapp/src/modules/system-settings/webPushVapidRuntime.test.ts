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
});
