import { describe, expect, it } from "vitest";
import { buildReminderSendsLast24hClock } from "./reminderHourlyClock";

describe("buildReminderSendsLast24hClock", () => {
  it("aggregates sent by local hour from PG buckets", () => {
    const rows = buildReminderSendsLast24hClock([
      { bucket: "2026-05-28 14:00:00", sent: 3, failed: 0 },
      { bucket: "2026-05-28 10:00:00", sent: 2, failed: 1 },
    ]);

    expect(rows[14]?.sent).toBe(3);
    expect(rows[10]?.sent).toBe(2);
    expect(rows.reduce((a, s) => a + s.sent, 0)).toBe(5);
  });
});
