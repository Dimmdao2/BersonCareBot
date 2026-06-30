import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseCalendarQuery } from "./parseCalendarQuery";

function mskDate(iso: string): string | null {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/Moscow").toISODate();
}
function mskHour(iso: string): number {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/Moscow").hour;
}

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

  it("3days view → anchor + 2 days forward (inclusive)", () => {
    const parsed = parseCalendarQuery(new URLSearchParams("date=2026-06-01&view=3days"), "Europe/Moscow");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.view).toBe("3days");
    expect(mskDate(parsed.rangeStart)).toBe("2026-06-01");
    expect(mskHour(parsed.rangeStart)).toBe(0);
    expect(mskDate(parsed.rangeEnd)).toBe("2026-06-03");
  });

  it("month view → strict 1st..last (no FullCalendar overflow days)", () => {
    const parsed = parseCalendarQuery(new URLSearchParams("date=2026-06-15&view=month"), "Europe/Moscow");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(mskDate(parsed.rangeStart)).toBe("2026-06-01");
    expect(mskDate(parsed.rangeEnd)).toBe("2026-06-30");
  });

  it("feed view without from/to → ±30 days around anchor", () => {
    const parsed = parseCalendarQuery(new URLSearchParams("date=2026-06-01&view=feed"), "Europe/Moscow");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.view).toBe("feed");
    expect(mskDate(parsed.rangeStart)).toBe("2026-05-02");
    expect(mskDate(parsed.rangeEnd)).toBe("2026-07-01");
  });

  it("explicit from/to override view→range", () => {
    const parsed = parseCalendarQuery(
      new URLSearchParams("date=2026-06-01&view=feed&from=2026-06-10&to=2026-06-12"),
      "Europe/Moscow",
    );
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(mskDate(parsed.rangeStart)).toBe("2026-06-10");
    expect(mskHour(parsed.rangeStart)).toBe(0);
    expect(mskDate(parsed.rangeEnd)).toBe("2026-06-12");
    expect(mskHour(parsed.rangeEnd)).toBe(23);
  });
});
