import { describe, expect, it } from "vitest";
import { parseCalendarQuery } from "./parseCalendarQuery";

describe("parseCalendarQuery", () => {
  it("returns week range for anchor date in MSK", () => {
    const parsed = parseCalendarQuery(new URLSearchParams("date=2026-05-30&view=week"), "Europe/Moscow");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.view).toBe("week");
    expect(parsed.anchorDate).toBe("2026-05-30");
    expect(parsed.rangeStart).toMatch(/T/);
    expect(parsed.rangeEnd > parsed.rangeStart).toBe(true);
  });

  it("rejects invalid date", () => {
    const parsed = parseCalendarQuery(new URLSearchParams("date=bad"), "Europe/Moscow");
    expect(parsed).toEqual({ error: "invalid_date" });
  });

  it("parses service filter and free slots flag", () => {
    const parsed = parseCalendarQuery(
      new URLSearchParams("date=2026-05-30&serviceId=svc-1&includeFreeSlots=1"),
      "Europe/Moscow",
    );
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.serviceId).toBe("svc-1");
    expect(parsed.includeFreeSlots).toBe(true);
  });
});
