import { describe, expect, it } from "vitest";

import { createInMemoryAdminPlatformUserStatsPort } from "@/infra/repos/inMemoryAdminPlatformUserStats";
import { createAdminPlatformUserStatsService } from "@/modules/admin-platform-stats/service";

describe("createAdminPlatformUserStatsService", () => {
  it("fills series from dayKeys with zeros from in-memory port", async () => {
    const svc = createAdminPlatformUserStatsService(createInMemoryAdminPlatformUserStatsPort());
    const r = await svc.getRegistrationStats({
      iana: "UTC",
      preset: "today",
    });
    expect(r.summary.newUsers).toBe(0);
    expect(r.summary.merges).toBe(0);
    expect(r.summary.combined).toBe(0);
    expect(r.series.length).toBe(1);
    expect(r.series[0]?.newUsers).toBe(0);
    expect(r.series[0]?.merges).toBe(0);
  });
});
