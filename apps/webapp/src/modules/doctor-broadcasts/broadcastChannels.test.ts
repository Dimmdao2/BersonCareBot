import { describe, expect, it } from "vitest";
import { BROADCAST_ACTIVE_CHANNELS, normalizeBroadcastChannels } from "./broadcastChannels";

describe("normalizeBroadcastChannels", () => {
  it("defaults to all active channels when input is empty", () => {
    expect(normalizeBroadcastChannels(undefined)).toEqual([...BROADCAST_ACTIVE_CHANNELS].sort());
    expect(normalizeBroadcastChannels(null)).toEqual([...BROADCAST_ACTIVE_CHANNELS].sort());
    expect(normalizeBroadcastChannels([])).toEqual([...BROADCAST_ACTIVE_CHANNELS].sort());
  });

  it("keeps only active channels, unique and sorted", () => {
    expect(normalizeBroadcastChannels(["sms", "bot_message", "sms", "push"])).toEqual([
      "bot_message",
      "push",
      "sms",
    ]);
  });

  it("drops planned-only channels from raw input", () => {
    expect(normalizeBroadcastChannels(["home_banner", "sms"])).toEqual(["sms"]);
  });

  it("throws when nothing active remains", () => {
    expect(() => normalizeBroadcastChannels(["home_banner", "notification_bell"])).toThrow(
      "invalid_broadcast_channels",
    );
  });
});
