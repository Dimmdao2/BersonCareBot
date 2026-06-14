import { describe, expect, it } from "vitest";
import { readAttributionFromJson, shouldSkipInboundRubitimeEcho } from "./loopGuard";
import { SYNC_ATTRIBUTION_KEYS, withSyncAttributionStamp } from "./syncAttribution";

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

  // R4: compound scenario — outbound stamp then inbound echo within window → suppressed, no duplicate
  it("R4: create-here-edit-there — inbound echo within window is suppressed (no duplicate canonical write)", () => {
    // Step 1: We pushed a change to Rubitime (outbound canonical → Rubitime).
    //   The attribution blob is stamped with `canonical` at T0.
    const T0 = new Date("2026-06-01T12:00:00.000Z");
    const stampedAttribution = withSyncAttributionStamp({}, "canonical", T0.toISOString());

    // Step 2: Rubitime echoes back the same change as an inbound event.
    //   This arrives 3 seconds after the outbound stamp — well within the 8s window.
    const echoArrivalMs = T0.getTime() + 3_000;
    const attribution = readAttributionFromJson(stampedAttribution);

    const shouldSkip = shouldSkipInboundRubitimeEcho(attribution, echoArrivalMs);

    // The echo guard must suppress the inbound — preventing a duplicate canonical row.
    expect(shouldSkip).toBe(true);
  });

  it("R4: create-there-edit-here — inbound after window is NOT suppressed (genuine external change)", () => {
    // Step 1: We pushed an outbound change at T0.
    const T0 = new Date("2026-06-01T12:00:00.000Z");
    const stampedAttribution = withSyncAttributionStamp({}, "canonical", T0.toISOString());

    // Step 2: A genuine Rubitime change arrives 15 seconds later (after the 8s echo window).
    //   This is NOT an echo — it's a real external edit.
    const externalChangeMs = T0.getTime() + 15_000;
    const attribution = readAttributionFromJson(stampedAttribution);

    const shouldSkip = shouldSkipInboundRubitimeEcho(attribution, externalChangeMs);

    // Must NOT suppress — this is a real external change that should be applied.
    expect(shouldSkip).toBe(false);
  });

  it("R4: create-there-edit-here — inbound with rubitime origin is never suppressed", () => {
    // When the last sync was from Rubitime (not canonical), no echo guard applies.
    const T0 = new Date("2026-06-01T12:00:00.000Z");
    const stampedAttribution = withSyncAttributionStamp({}, "rubitime", T0.toISOString());
    // Inbound arrives within what would be the echo window — but must NOT be suppressed
    const inboundMs = T0.getTime() + 2_000;
    const attribution = readAttributionFromJson(stampedAttribution);
    expect(shouldSkipInboundRubitimeEcho(attribution, inboundMs)).toBe(false);
  });
});
