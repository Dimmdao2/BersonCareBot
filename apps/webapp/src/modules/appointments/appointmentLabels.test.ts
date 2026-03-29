import { describe, expect, it } from "vitest";
import { appointmentRowLabel, formatRuAppointmentDate, formatRuAppointmentTime } from "./appointmentLabels";

describe("appointmentLabels", () => {
  it("formats date and time without seconds", () => {
    const d = new Date("2026-03-15T14:30:45.000Z");
    expect(formatRuAppointmentTime(d)).toMatch(/^\d{1,2}:\d{2}$/);
    expect(formatRuAppointmentDate(d)).toContain("2026");
  });

  it("appointmentRowLabel joins parts", () => {
    expect(appointmentRowLabel("15.03.2026", "14:30")).toBe("15.03.2026 14:30");
    expect(appointmentRowLabel("—", "—")).toBe("—");
  });
});
