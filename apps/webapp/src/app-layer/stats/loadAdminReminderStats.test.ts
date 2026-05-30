import { describe, expect, it } from "vitest";
import { parseReminderStatsWindowHours } from "./loadAdminReminderStats";

describe("parseReminderStatsWindowHours", () => {
  it("defaults to 168 when param is missing or empty", () => {
    expect(parseReminderStatsWindowHours(null)).toBe(168);
    expect(parseReminderStatsWindowHours("")).toBe(168);
    expect(parseReminderStatsWindowHours("   ")).toBe(168);
  });

  it("clamps to 1..720", () => {
    expect(parseReminderStatsWindowHours("0")).toBe(168);
    expect(parseReminderStatsWindowHours("1")).toBe(1);
    expect(parseReminderStatsWindowHours("720")).toBe(720);
    expect(parseReminderStatsWindowHours("9999")).toBe(720);
  });

  it("returns default for non-numeric input", () => {
    expect(parseReminderStatsWindowHours("abc")).toBe(168);
  });
});
