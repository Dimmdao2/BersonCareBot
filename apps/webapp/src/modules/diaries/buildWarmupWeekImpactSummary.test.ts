import { describe, expect, it } from "vitest";
import { buildWarmupWeekImpactSummary } from "./buildWarmupWeekImpactSummary";

describe("buildWarmupWeekImpactSummary", () => {
  const hour = 60 * 60 * 1000;

  it("no warmups", () => {
    expect(buildWarmupWeekImpactSummary([{ t: 1, v: 3 }], [])).toMatchObject({
      kind: "no_warmups",
      warmupCount: 0,
    });
  });

  it("insufficient_pairs when нет instant", () => {
    expect(buildWarmupWeekImpactSummary([], [{ t: 100, v: 5, band: "high" }])).toMatchObject({
      kind: "insufficient_pairs",
      pairedCount: 0,
    });
  });

  it("paired: улучшение после разминки", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [
      { t: t0, v: 2 },
      { t: t0 + 5 * hour, v: 4 },
    ];
    const warmup = [{ t: t0 + 2 * hour, v: 5, band: "high" as const }];
    const r = buildWarmupWeekImpactSummary(instant, warmup);
    expect(r.kind).toBe("improved");
    expect(r.avgDelta).toBeCloseTo(2, 5);
    expect(r.pairedCount).toBe(1);
  });

  it("paired: ухудшение", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [
      { t: t0, v: 5 },
      { t: t0 + 5 * hour, v: 2 },
    ];
    const warmup = [{ t: t0 + 2 * hour, v: 1, band: "low" as const }];
    const r = buildWarmupWeekImpactSummary(instant, warmup);
    expect(r.kind).toBe("worse");
    expect(r.avgDelta).toBeCloseTo(-3, 5);
  });

  it("игнорирует отметки вне 24ч окна", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [{ t: t0, v: 3 }];
    const warmup = [{ t: t0 + 30 * hour, v: 5, band: "high" as const }];
    expect(buildWarmupWeekImpactSummary(instant, warmup).kind).toBe("insufficient_pairs");
  });
});
