/**
 * In-process smoke: графики и таблицы статистики (этап 7) экспортируются и импортируются.
 */
import { describe, expect, it } from "vitest";

describe("charts e2e (in-process)", () => {
  it("SymptomChart module loads", async () => {
    const mod = await import("@/modules/diaries/components/SymptomChart");
    expect(typeof mod.SymptomChart).toBe("function");
  });

  it("LfkStatsTable module loads", async () => {
    const mod = await import("@/modules/diaries/components/LfkStatsTable");
    expect(typeof mod.LfkStatsTable).toBe("function");
  });

  it("stats aggregation module loads", async () => {
    const mod = await import("@/modules/diaries/stats/aggregation");
    expect(typeof mod.aggregateSymptomEntriesByDay).toBe("function");
  });
});
