import { describe, expect, it, vi } from "vitest";
import { getWebPushVapidKeyPair } from "./webPushVapidRuntime";

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
