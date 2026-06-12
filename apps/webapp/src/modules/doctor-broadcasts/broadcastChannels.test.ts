import { describe, expect, it } from "vitest";
import { BROADCAST_DEFAULT_CHANNELS, normalizeBroadcastChannels } from "./broadcastChannels";

describe("normalizeBroadcastChannels", () => {
  it("defaults to default channels (telegram+max+push) when input is empty", () => {
    const expected = [...BROADCAST_DEFAULT_CHANNELS].sort();
    expect(normalizeBroadcastChannels(undefined)).toEqual(expected);
    expect(normalizeBroadcastChannels(null)).toEqual(expected);
    expect(normalizeBroadcastChannels([])).toEqual(expected);
  });

  it("expands legacy bot_message to telegram+max, deduplicates, sorts", () => {
    // bot_message → telegram + max; sms stays; push stays
    expect(normalizeBroadcastChannels(["sms", "bot_message", "sms", "push"])).toEqual([
      "max",
      "push",
      "sms",
      "telegram",
    ]);
  });

  it("accepts new explicit telegram/max/email channels", () => {
    expect(normalizeBroadcastChannels(["telegram", "max", "email"])).toEqual([
      "email",
      "max",
      "telegram",
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

  it("bot_message in input with explicit telegram deduplicates correctly", () => {
    // bot_message → telegram + max; telegram already there → deduplicated
    expect(normalizeBroadcastChannels(["bot_message", "telegram"])).toEqual(["max", "telegram"]);
  });
});
