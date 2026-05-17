import { describe, expect, it } from "vitest";

import {
  enumerateLocalDayKeysInclusive,
  resolveAdminStatsLocalRange,
} from "@/modules/admin-platform-stats/registrationTimeRange";

describe("registrationTimeRange", () => {
  it("enumerates inclusive local days in UTC zone", () => {
    expect(enumerateLocalDayKeysInclusive("UTC", "2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("throws on inverted range", () => {
    expect(() => enumerateLocalDayKeysInclusive("UTC", "2026-01-05", "2026-01-01")).toThrow("range_inverted");
  });

  it("throws on custom too long span", () => {
    expect(() =>
      resolveAdminStatsLocalRange("UTC", "custom", "2025-01-01", "2026-06-15"),
    ).toThrow("range_too_long");
  });

  it("throws range_too_short when custom shorter than enforced minimum", () => {
    expect(() =>
      resolveAdminStatsLocalRange("UTC", "custom", "2026-01-01", "2026-01-06", {
        enforceMinInclusiveDays: 7,
      }),
    ).toThrow("range_too_short");
  });

  it("allows custom exactly at enforced minimum", () => {
    const r = resolveAdminStatsLocalRange("UTC", "custom", "2026-01-01", "2026-01-07", {
      enforceMinInclusiveDays: 7,
    });
    expect(r.dayKeys.length).toBe(7);
  });

  it("allows short custom without enforcement", () => {
    const r = resolveAdminStatsLocalRange("UTC", "custom", "2026-01-01", "2026-01-01");
    expect(r.dayKeys.length).toBe(1);
  });
});
