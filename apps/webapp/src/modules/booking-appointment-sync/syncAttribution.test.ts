import { describe, expect, it } from "vitest";
import { readSyncAttribution, withSyncAttributionStamp, SYNC_ATTRIBUTION_KEYS } from "./syncAttribution";

describe("syncAttribution", () => {
  it("increments syncVersion on each stamp", () => {
    const first = withSyncAttributionStamp({}, "rubitime");
    expect(first[SYNC_ATTRIBUTION_KEYS.syncVersion]).toBe(1);
    const second = withSyncAttributionStamp(first, "canonical");
    expect(second[SYNC_ATTRIBUTION_KEYS.syncVersion]).toBe(2);
    const meta = readSyncAttribution(second);
    expect(meta.lastSyncedFrom).toBe("canonical");
    expect(meta.syncVersion).toBe(2);
  });
});
