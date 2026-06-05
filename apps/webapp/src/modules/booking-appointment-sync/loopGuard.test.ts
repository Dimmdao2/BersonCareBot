import { describe, expect, it } from "vitest";
import { readAttributionFromJson, shouldSkipInboundRubitimeEcho } from "./loopGuard";
import { SYNC_ATTRIBUTION_KEYS } from "./syncAttribution";

describe("shouldSkipInboundRubitimeEcho", () => {
  it("suppresses inbound within echo window after canonical outbound", () => {
    const syncedAt = new Date("2026-06-01T12:00:00.000Z").toISOString();
    const nowMs = Date.parse("2026-06-01T12:00:05.000Z");
    expect(
      shouldSkipInboundRubitimeEcho(
        { lastSyncedFrom: "canonical", syncedAt, syncVersion: 1 },
        nowMs,
      ),
    ).toBe(true);
  });

  it("allows inbound after echo window", () => {
    const syncedAt = new Date("2026-06-01T12:00:00.000Z").toISOString();
    const nowMs = Date.parse("2026-06-01T12:00:15.000Z");
    expect(
      shouldSkipInboundRubitimeEcho(
        { lastSyncedFrom: "canonical", syncedAt, syncVersion: 1 },
        nowMs,
      ),
    ).toBe(false);
  });

  it("allows inbound when last sync was from rubitime", () => {
    expect(
      shouldSkipInboundRubitimeEcho({
        lastSyncedFrom: "rubitime",
        syncedAt: new Date().toISOString(),
        syncVersion: 1,
      }),
    ).toBe(false);
  });

  it("reads attribution keys from json blob", () => {
    const syncedAt = new Date().toISOString();
    const nowMs = Date.now();
    expect(
      shouldSkipInboundRubitimeEcho(
        readAttributionFromJson({
          [SYNC_ATTRIBUTION_KEYS.lastSyncedFrom]: "canonical",
          [SYNC_ATTRIBUTION_KEYS.syncedAt]: syncedAt,
        }),
        nowMs,
      ),
    ).toBe(true);
  });
});
