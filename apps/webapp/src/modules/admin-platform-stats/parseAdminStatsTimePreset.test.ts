import { describe, expect, it } from "vitest";

import { parseAdminStatsTimePreset } from "@/modules/admin-platform-stats/parseAdminStatsTimePreset";

describe("parseAdminStatsTimePreset", () => {
  it("accepts day, month and custom", () => {
    expect(parseAdminStatsTimePreset("day")).toBe("day");
    expect(parseAdminStatsTimePreset("month")).toBe("month");
    expect(parseAdminStatsTimePreset("custom")).toBe("custom");
  });

  it("defaults unknown and legacy today to week", () => {
    expect(parseAdminStatsTimePreset(null)).toBe("week");
    expect(parseAdminStatsTimePreset("today")).toBe("week");
    expect(parseAdminStatsTimePreset("week")).toBe("week");
  });
});
