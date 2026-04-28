import { describe, expect, it } from "vitest";
import {
  parsePatientHomeMorningPingEnabled,
  parsePatientHomeMorningPingLocalTime,
} from "@/modules/patient-home/patientHomeMorningPingSettings";

describe("patientHomeMorningPingSettings", () => {
  it("parsePatientHomeMorningPingEnabled reads wrapped boolean", () => {
    expect(parsePatientHomeMorningPingEnabled({ value: true })).toBe(true);
    expect(parsePatientHomeMorningPingEnabled({ value: false })).toBe(false);
    expect(parsePatientHomeMorningPingEnabled(null)).toBe(false);
  });

  it("parsePatientHomeMorningPingLocalTime pads HH:MM", () => {
    expect(parsePatientHomeMorningPingLocalTime({ value: "9:05" })).toBe("09:05");
    expect(parsePatientHomeMorningPingLocalTime({ value: "invalid" })).toBe("09:00");
  });
});
