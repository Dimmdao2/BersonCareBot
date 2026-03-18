import { describe, expect, it } from "vitest";
import { getPatientCabinetState } from "./service";

describe("patient-cabinet service", () => {
  it("returns state with enabled and reason", () => {
    const state = getPatientCabinetState(0);
    expect(state).toHaveProperty("enabled");
    expect(state).toHaveProperty("reason");
    expect(typeof state.enabled).toBe("boolean");
    expect(typeof state.reason).toBe("string");
  });

  it("returns nextAppointmentLabel", () => {
    const state = getPatientCabinetState(0);
    expect(state).toHaveProperty("nextAppointmentLabel");
  });

  it("enables cabinet when appointmentCount > 0", () => {
    expect(getPatientCabinetState(0).enabled).toBe(false);
    expect(getPatientCabinetState(1).enabled).toBe(true);
  });
});
