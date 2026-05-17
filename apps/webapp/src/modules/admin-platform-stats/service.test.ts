import { describe, expect, it } from "vitest";

import { createInMemoryAdminPlatformUserStatsPort } from "@/infra/repos/inMemoryAdminPlatformUserStats";
import { createAdminPlatformUserStatsService } from "@/modules/admin-platform-stats/service";

describe("createAdminPlatformUserStatsService", () => {
  it("registration stats reject custom shorter than 7 calendar days", async () => {
    const svc = createAdminPlatformUserStatsService(createInMemoryAdminPlatformUserStatsPort());
    await expect(
      svc.getRegistrationStats({
        iana: "UTC",
        preset: "custom",
        customFrom: "2026-01-01",
        customTo: "2026-01-03",
      }),
    ).rejects.toThrow("range_too_short");
  });

  it("fills registration series from dayKeys with zeros from in-memory port", async () => {
    const svc = createAdminPlatformUserStatsService(createInMemoryAdminPlatformUserStatsPort());
    const r = await svc.getRegistrationStats({
      iana: "UTC",
      preset: "week",
    });
    expect(r.summary.newUsers).toBe(0);
    expect(r.summary.merges).toBe(0);
    expect(r.summary.combined).toBe(0);
    expect(r.series.length).toBe(7);
    expect(r.series[0]?.newUsers).toBe(0);
    expect(r.series[0]?.merges).toBe(0);
  });

  it("returns flat cumulative subscriber series when no subscribers in range", async () => {
    const svc = createAdminPlatformUserStatsService(createInMemoryAdminPlatformUserStatsPort());
    const r = await svc.getSubscriberStats({
      iana: "UTC",
      preset: "week",
    });
    expect(r.summary.cumulativeEnd).toBe(0);
    expect(r.summary.deltaInRange).toBe(0);
    expect(r.series.length).toBe(7);
    expect(r.series.every((p) => p.cumulativeSubscribers === 0)).toBe(true);
  });
});
