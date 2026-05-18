import { describe, expect, it } from "vitest";
import {
  assertChannelAllowedForPreferredAuth,
  isChannelAllowedForPreferredAuth,
  PreferredAuthChannelNotAllowedError,
} from "./preferredAuthChannelPolicy";

describe("preferredAuthChannelPolicy", () => {
  it("allows null and sms/telegram/max/email", () => {
    expect(isChannelAllowedForPreferredAuth(null)).toBe(true);
    expect(isChannelAllowedForPreferredAuth("telegram")).toBe(true);
    expect(isChannelAllowedForPreferredAuth("sms")).toBe(true);
  });

  it("rejects web_push and vk", () => {
    expect(isChannelAllowedForPreferredAuth("web_push")).toBe(false);
    expect(isChannelAllowedForPreferredAuth("vk")).toBe(false);
    expect(() => assertChannelAllowedForPreferredAuth("web_push")).toThrow(PreferredAuthChannelNotAllowedError);
    expect(() => assertChannelAllowedForPreferredAuth("vk")).toThrow(PreferredAuthChannelNotAllowedError);
  });
});
