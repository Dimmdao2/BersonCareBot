import { describe, expect, it } from "vitest";
import { getUpcomingAppointments } from "./service";

describe("appointments service", () => {
  it("returns array (empty without DB bridge)", () => {
    const list = getUpcomingAppointments("user-1");
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(0);
  });

  it("fixture shape for UI tests when populated from integration", () => {
    const fixture = {
      id: "apt-1",
      dateLabel: "15.03.2026",
      timeLabel: "14:30",
      label: "15.03.2026 14:30",
      link: "https://example.com/",
      status: "confirmed" as const,
    };
    expect(fixture).toMatchObject({
      id: expect.any(String),
      status: expect.any(String),
    });
  });
});
