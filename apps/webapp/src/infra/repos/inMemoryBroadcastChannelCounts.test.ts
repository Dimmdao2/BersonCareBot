import { describe, it, expect } from "vitest";
import {
  createInMemoryBroadcastChannelCountsPort,
  DEFAULT_IN_MEMORY_CHANNEL_COUNTS,
} from "./inMemoryBroadcastChannelCounts";

describe("createInMemoryBroadcastChannelCountsPort", () => {
  it("returns default zeros for all 6 channels", async () => {
    const port = createInMemoryBroadcastChannelCountsPort();
    const counts = await port.getChannelConnectionCounts();
    expect(counts).toEqual(DEFAULT_IN_MEMORY_CHANNEL_COUNTS);
    expect(counts.telegram).toBe(0);
    expect(counts.max).toBe(0);
    expect(counts.push).toBe(0);
    expect(counts.sms).toBe(0);
    expect(counts.email).toBe(0);
    expect(counts.bot_message).toBe(0);
  });

  it("returns custom counts when provided", async () => {
    const port = createInMemoryBroadcastChannelCountsPort({
      bot_message: 5,
      telegram: 10,
      max: 3,
      push: 7,
      sms: 4,
      email: 2,
    });
    const counts = await port.getChannelConnectionCounts();
    expect(counts.telegram).toBe(10);
    expect(counts.max).toBe(3);
    expect(counts.push).toBe(7);
    expect(counts.sms).toBe(4);
    expect(counts.email).toBe(2);
    expect(counts.bot_message).toBe(5);
  });

  it("returns a copy (not the original reference)", async () => {
    const port = createInMemoryBroadcastChannelCountsPort({ bot_message: 1, telegram: 1, max: 1, push: 1, sms: 1, email: 1 });
    const c1 = await port.getChannelConnectionCounts();
    const c2 = await port.getChannelConnectionCounts();
    expect(c1).not.toBe(c2);
    expect(c1).toEqual(c2);
  });
});
