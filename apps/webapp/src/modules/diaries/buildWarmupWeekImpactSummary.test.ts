import { describe, expect, it } from "vitest";
import { buildWarmupWeekImpactSummary } from "./buildWarmupWeekImpactSummary";

const Z = "UTC";

describe("buildWarmupWeekImpactSummary", () => {
  const hour = 60 * 60 * 1000;

  it("no warmups", () => {
    expect(buildWarmupWeekImpactSummary([{ t: 1, v: 3 }], [], Z)).toMatchObject({
      kind: "no_warmups",
      warmupCount: 0,
    });
  });

  it("insufficient_pairs when нет instant", () => {
    expect(buildWarmupWeekImpactSummary([], [{ t: 100, v: 5, band: "high" }], Z)).toMatchObject({
      kind: "insufficient_pairs",
      pairedCount: 0,
    });
  });

  it("paired: улучшение — Δ = оценка после разминки минус общая до (тот же календарный день)", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [
      { t: t0, v: 2 },
      { t: t0 + 5 * hour, v: 4 },
    ];
    const warmup = [{ t: t0 + 2 * hour, v: 5, band: "high" as const }];
    const r = buildWarmupWeekImpactSummary(instant, warmup, Z);
    expect(r.kind).toBe("improved");
    expect(r.avgDelta).toBeCloseTo(3, 5);
    expect(r.pairedCount).toBe(1);
  });

  it("paired: ухудшение", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [
      { t: t0, v: 5 },
      { t: t0 + 5 * hour, v: 2 },
    ];
    const warmup = [{ t: t0 + 2 * hour, v: 1, band: "low" as const }];
    const r = buildWarmupWeekImpactSummary(instant, warmup, Z);
    expect(r.kind).toBe("worse");
    expect(r.avgDelta).toBeCloseTo(-4, 5);
  });

  it("игнорирует instant после разминки при расчёте Δ", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [
      { t: t0, v: 3 },
      { t: t0 + 4 * hour, v: 5 },
    ];
    const warmup = [{ t: t0 + 2 * hour, v: 3, band: "mid" as const }];
    const r = buildWarmupWeekImpactSummary(instant, warmup, Z);
    expect(r.avgDelta).toBeCloseTo(0, 5);
    expect(r.kind).toBe("neutral");
  });

  it("игнорирует общую отметку предыдущего календарного дня (даже в пределах 24ч)", () => {
    const instantDay1 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const warmupNextDay = Date.UTC(2026, 4, 6, 7, 0, 0);
    const instant = [{ t: instantDay1, v: 3 }];
    const warmup = [{ t: warmupNextDay, v: 5, band: "high" as const }];
    expect(warmupNextDay - instantDay1).toBeLessThan(24 * hour);
    expect(buildWarmupWeekImpactSummary(instant, warmup, Z).kind).toBe("insufficient_pairs");
  });

  it("игнорирует общую отметку вне суток до разминки (разные дни, >24ч)", () => {
    const t0 = Date.UTC(2026, 4, 5, 8, 0, 0);
    const instant = [{ t: t0, v: 3 }];
    const warmup = [{ t: t0 + 30 * hour, v: 5, band: "high" as const }];
    expect(buildWarmupWeekImpactSummary(instant, warmup, Z).kind).toBe("insufficient_pairs");
  });
});
