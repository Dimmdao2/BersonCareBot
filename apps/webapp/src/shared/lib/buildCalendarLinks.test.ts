import { describe, it, expect } from "vitest";
import {
  toIcsDateTime,
  escapeIcsText,
  buildIcsContent,
  buildGoogleCalendarUrl,
  buildYandexCalendarUrl,
} from "./buildCalendarLinks";

const baseParams = {
  startAt: "2026-09-15T10:00:00.000Z",
  endAt: "2026-09-15T11:00:00.000Z",
  summary: "Сеанс реабилитации · Иванов И.И.",
  location: "Москва, ул. Тверская, 1",
  description: "Запись через приложение BersonCare",
  bookingId: "abc-123",
} as const;

describe("toIcsDateTime", () => {
  it("formats UTC date correctly", () => {
    expect(toIcsDateTime(new Date("2026-09-15T10:00:00.000Z"))).toBe("20260915T100000Z");
  });

  it("pads single-digit months and days", () => {
    expect(toIcsDateTime(new Date("2026-01-05T09:05:03.000Z"))).toBe("20260105T090503Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes comma, semicolon, backslash, and newline", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("strips carriage returns", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
  });

  it("does not modify plain text", () => {
    expect(escapeIcsText("Сеанс реабилитации")).toBe("Сеанс реабилитации");
  });
});

describe("buildIcsContent", () => {
  it("contains required VCALENDAR/VEVENT structure", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses stable UID from bookingId", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("UID:booking-abc-123@bersoncare.ru");
  });

  it("produces correct DTSTART/DTEND", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("DTSTART:20260915T100000Z");
    expect(ics).toContain("DTEND:20260915T110000Z");
  });

  it("includes SUMMARY and LOCATION", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("SUMMARY:Сеанс реабилитации · Иванов И.И.");
    expect(ics).toContain("LOCATION:Москва\\, ул. Тверская\\, 1");
  });

  it("includes DESCRIPTION", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("DESCRIPTION:Запись через приложение BersonCare");
  });

  it("omits LOCATION when not provided", () => {
    const ics = buildIcsContent({ ...baseParams, location: "" });
    expect(ics).not.toContain("LOCATION:");
  });

  it("uses CRLF line endings (RFC 5545)", () => {
    const ics = buildIcsContent(baseParams);
    expect(ics).toContain("\r\n");
    // All lines must end with CRLF
    const lines = ics.split("\r\n");
    expect(lines.length).toBeGreaterThan(5);
  });

  it("generates random UID when bookingId is absent", () => {
    const ics = buildIcsContent({ ...baseParams, bookingId: undefined });
    expect(ics).toMatch(/UID:booking-[^@]+@bersoncare\.ru/);
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("starts with Google Calendar render URL", () => {
    const url = buildGoogleCalendarUrl(baseParams);
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render/);
  });

  it("contains action=TEMPLATE", () => {
    const url = buildGoogleCalendarUrl(baseParams);
    expect(url).toContain("action=TEMPLATE");
  });

  it("encodes dates in compact UTC format", () => {
    const url = buildGoogleCalendarUrl(baseParams);
    expect(url).toContain("20260915T100000Z");
    expect(url).toContain("20260915T110000Z");
  });

  it("includes text (summary)", () => {
    const url = buildGoogleCalendarUrl(baseParams);
    // URLSearchParams uses + for spaces; decode both %XX and + to verify readable text.
    const decoded = decodeURIComponent(url.replace(/\+/g, " "));
    expect(decoded).toContain("Сеанс реабилитации · Иванов И.И.");
  });

  it("includes location when provided", () => {
    const url = buildGoogleCalendarUrl(baseParams);
    const decoded = decodeURIComponent(url.replace(/\+/g, " "));
    expect(decoded).toContain("Москва");
  });

  it("omits location when not provided", () => {
    const url = buildGoogleCalendarUrl({ ...baseParams, location: "" });
    expect(url).not.toContain("location=");
  });
});

describe("buildYandexCalendarUrl", () => {
  it("starts with Yandex Calendar URL", () => {
    const url = buildYandexCalendarUrl(baseParams);
    expect(url).toMatch(/^https:\/\/calendar\.yandex\.ru\/event\/create/);
  });

  it("contains Unix timestamps for from/to", () => {
    const url = buildYandexCalendarUrl(baseParams);
    const from = Math.floor(new Date(baseParams.startAt).getTime() / 1000);
    const to = Math.floor(new Date(baseParams.endAt).getTime() / 1000);
    expect(url).toContain(`from=${from}`);
    expect(url).toContain(`to=${to}`);
  });

  it("includes name (summary)", () => {
    const url = buildYandexCalendarUrl(baseParams);
    const decoded = decodeURIComponent(url.replace(/\+/g, " "));
    expect(decoded).toContain("Сеанс реабилитации");
  });
});
