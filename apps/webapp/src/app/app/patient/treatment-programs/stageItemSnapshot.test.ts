import { beforeAll, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatRelativeTimeRu } from "./stageItemSnapshot";

beforeAll(() => {
  process.env.TZ = "UTC";
});

/** Фиксированный «сейчас» в UTC; при TZ=UTC совпадает с Luxon `local`. */
function fixedNowUtc() {
  return DateTime.fromObject(
    { year: 2026, month: 5, day: 7, hour: 10, minute: 0, second: 0 },
    { zone: "utc" },
  );
}

describe("formatRelativeTimeRu (сутки с 03:00 локально)", () => {
  it("в текущих сутках — часы назад", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 7, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("3 часа назад");
  });

  it("в текущих сутках — менее часа", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 9, minute: 30, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("менее часа назад");
  });

  it("предыдущие сутки 03:00–03:00 — вчера", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 6, hour: 15, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("вчера");
  });

  it("до 03:00 календарного дня относится к предыдущим суткам — вчера относительно сегодняшнего окна", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 2, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("вчера");
  });

  it("раньше — N дней назад", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 6, hour: 2, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("2 дня назад");
  });
});
