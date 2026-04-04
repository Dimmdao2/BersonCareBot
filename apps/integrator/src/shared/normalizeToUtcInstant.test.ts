import { describe, expect, it } from "vitest";
import {
  normalizeToUtcInstant,
  tryNormalizeToUtcInstant,
} from "./normalizeToUtcInstant.js";

describe("normalizeToUtcInstant", () => {
  it("S2: naive space + Europe/Moscow → UTC", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "Europe/Moscow")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("S2: naive space + Europe/Samara → UTC (proves IANA, not MSK hardcode)", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "Europe/Samara")).toBe("2026-04-07T07:00:00.000Z");
  });

  it("S2: ISO with Z → same instant as Date#toISOString", () => {
    const raw = "2026-04-07T11:00:00.000Z";
    expect(normalizeToUtcInstant(raw, "Europe/Moscow")).toBe(new Date(raw).toISOString());
  });

  it("S2: ISO with explicit positive offset → UTC", () => {
    expect(normalizeToUtcInstant("2026-04-07T11:00:00+03:00", "Europe/Moscow")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("S2: naive T-separator + Europe/Moscow → UTC", () => {
    expect(normalizeToUtcInstant("2026-04-07T11:00:00", "Europe/Moscow")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("S2: empty, garbage, impossible calendar → null", () => {
    expect(normalizeToUtcInstant("", "Europe/Moscow")).toBeNull();
    expect(normalizeToUtcInstant("   ", "Europe/Moscow")).toBeNull();
    expect(normalizeToUtcInstant("abc", "Europe/Moscow")).toBeNull();
    expect(normalizeToUtcInstant("2026-99-99 25:99:99", "Europe/Moscow")).toBeNull();
  });

  it("trims raw wall-clock string", () => {
    expect(normalizeToUtcInstant("  2026-04-07 11:00:00  ", "Europe/Moscow")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("trims sourceTimezone (IANA)", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "  Europe/Moscow  ")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("naive with fractional seconds via IANA zone", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00.5", "Etc/UTC")).toBe("2026-04-07T11:00:00.500Z");
    expect(normalizeToUtcInstant("2026-04-07T11:00:00.123456", "Etc/UTC")).toBe("2026-04-07T11:00:00.123Z");
  });

  it("invalid IANA → null (even if raw has Z)", () => {
    expect(normalizeToUtcInstant("2026-04-07T11:00:00.000Z", "Not/AValidZone")).toBeNull();
  });

  it("invalid IANA → null for naive input", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "Invalid/Timezone")).toBeNull();
  });

  it("empty timezone → null", () => {
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "")).toBeNull();
    expect(normalizeToUtcInstant("2026-04-07 11:00:00", "   ")).toBeNull();
  });

  it("ISO with numeric offset without colon → UTC", () => {
    expect(normalizeToUtcInstant("2026-04-07T11:00:00+0300", "Europe/Moscow")).toBe("2026-04-07T08:00:00.000Z");
  });

  it("ISO with lowercase z", () => {
    const raw = "2026-04-07T11:00:00.000z";
    expect(normalizeToUtcInstant(raw, "Europe/Moscow")).toBe(new Date(raw).toISOString());
  });

  it("non-naive ISO date-only parses via Date (UTC midnight)", () => {
    expect(normalizeToUtcInstant("2026-04-07", "Europe/Moscow")).toBe("2026-04-07T00:00:00.000Z");
  });

  it("America/New_York summer wall time → deterministic UTC", () => {
    expect(normalizeToUtcInstant("2024-07-15 12:00:00", "America/New_York")).toBe("2024-07-15T16:00:00.000Z");
  });

  it("spring-forward gap: Luxon maps non-existent wall time to next valid local (IANA-based, deterministic)", () => {
    expect(normalizeToUtcInstant("2024-03-10 02:30:00", "America/New_York")).toBe("2024-03-10T07:30:00.000Z");
  });

  it("same wall clock in two IANA zones → different UTC instants (no fixed offset hack)", () => {
    const msk = normalizeToUtcInstant("2026-06-01 12:00:00", "Europe/Moscow");
    const kg = normalizeToUtcInstant("2026-06-01 12:00:00", "Europe/Kaliningrad");
    expect(msk).toBe("2026-06-01T09:00:00.000Z");
    expect(kg).toBe("2026-06-01T10:00:00.000Z");
    expect(msk).not.toBe(kg);
  });

  it("negative numeric offset → UTC", () => {
    expect(normalizeToUtcInstant("2026-04-07T11:00:00-05:00", "Europe/Moscow")).toBe("2026-04-07T16:00:00.000Z");
  });
});

describe("tryNormalizeToUtcInstant (failure reasons for incidents/alerts)", () => {
  it("success mirrors normalizeToUtcInstant", () => {
    const r = tryNormalizeToUtcInstant("2026-04-07 11:00:00", "Europe/Moscow");
    expect(r).toEqual({ ok: true, utcIso: "2026-04-07T08:00:00.000Z" });
  });

  it("invalid_timezone: empty or invalid IANA", () => {
    expect(tryNormalizeToUtcInstant("2026-04-07 11:00:00", "")).toEqual({
      ok: false,
      reason: "invalid_timezone",
    });
    expect(tryNormalizeToUtcInstant("2026-04-07T11:00:00.000Z", "Not/AValidZone")).toEqual({
      ok: false,
      reason: "invalid_timezone",
    });
  });

  it("invalid_datetime: empty raw, impossible naive calendar", () => {
    expect(tryNormalizeToUtcInstant("", "Europe/Moscow")).toEqual({
      ok: false,
      reason: "invalid_datetime",
    });
    expect(tryNormalizeToUtcInstant("2026-99-99 25:99:99", "Europe/Moscow")).toEqual({
      ok: false,
      reason: "invalid_datetime",
    });
  });

  it("unsupported_format: non-naive string that Date.parse rejects", () => {
    expect(tryNormalizeToUtcInstant("abc", "Europe/Moscow")).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
  });

  it("non-string raw → invalid_datetime (no throw)", () => {
    expect(tryNormalizeToUtcInstant(null, "Europe/Moscow")).toEqual({
      ok: false,
      reason: "invalid_datetime",
    });
    expect(tryNormalizeToUtcInstant(undefined, "Europe/Moscow")).toEqual({
      ok: false,
      reason: "invalid_datetime",
    });
  });

  it("non-string sourceTimezone → invalid_timezone (no throw)", () => {
    expect(tryNormalizeToUtcInstant("2026-04-07 11:00:00", null)).toEqual({
      ok: false,
      reason: "invalid_timezone",
    });
  });
});
