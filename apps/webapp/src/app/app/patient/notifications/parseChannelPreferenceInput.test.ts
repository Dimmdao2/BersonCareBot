import { describe, expect, it } from "vitest";
import { parseChannelNotificationInput } from "./parseChannelPreferenceInput";

describe("parseChannelNotificationInput", () => {
  it("accepts valid channel and boolean", () => {
    const r = parseChannelNotificationInput("telegram", true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.code).toBe("telegram");
      expect(r.enabled).toBe(true);
    }
  });

  it("rejects invalid channel", () => {
    const r = parseChannelNotificationInput("evil", true);
    expect(r.ok).toBe(false);
  });

  it("rejects non-boolean enabled", () => {
    const r = parseChannelNotificationInput("sms", "yes");
    expect(r.ok).toBe(false);
  });
});
