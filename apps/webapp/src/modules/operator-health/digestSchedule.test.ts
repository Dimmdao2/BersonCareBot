import { describe, expect, it } from "vitest";
import {
  buildDigestDedupKey,
  formatLocalHm,
  isDigestSendSlot,
  normalizeDigestTimeSlot,
  resolveDigestWindowStartIso,
} from "./digestSchedule";

describe("digestSchedule", () => {
  it("formatLocalHm returns HH:mm in IANA timezone", () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    expect(formatLocalHm(now, "Europe/Moscow")).toBe("09:00");
  });

  it("normalizeDigestTimeSlot snaps legacy minutes to :00", () => {
    expect(normalizeDigestTimeSlot("9:30")).toBe("09:00");
    expect(normalizeDigestTimeSlot("10:00")).toBe("10:00");
  });

  it("isDigestSendSlot matches digestTime in display TZ", () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    expect(isDigestSendSlot(now, "Europe/Moscow", "09:00")).toBe(true);
    expect(isDigestSendSlot(now, "Europe/Moscow", "10:00")).toBe(false);
    expect(isDigestSendSlot(now, "Europe/Moscow", "09:30")).toBe(true);
  });

  it("buildDigestDedupKey uses local calendar day", () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    expect(buildDigestDedupKey(now, "Europe/Moscow")).toBe("digest:2026-06-09");
  });

  it("resolveDigestWindowStartIso falls back to 24h without prior digest", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const start = resolveDigestWindowStartIso(null, now);
    expect(Date.parse(start)).toBe(now.getTime() - 24 * 60 * 60 * 1000);
  });

  it("resolveDigestWindowStartIso uses last digest sent at", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const last = "2026-06-08T06:00:00.000Z";
    expect(resolveDigestWindowStartIso(last, now)).toBe(last);
  });
});
