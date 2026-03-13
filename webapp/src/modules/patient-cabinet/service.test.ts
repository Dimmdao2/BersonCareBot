import { describe, expect, it } from "vitest";
import { getPatientCabinetState } from "./service";

describe("patient-cabinet service", () => {
  it("returns state with enabled and reason", () => {
    const state = getPatientCabinetState();
    expect(state).toHaveProperty("enabled");
    expect(state).toHaveProperty("reason");
    expect(typeof state.enabled).toBe("boolean");
    expect(typeof state.reason).toBe("string");
  });

  it("returns nextAppointmentLabel", () => {
    const state = getPatientCabinetState();
    expect(state).toHaveProperty("nextAppointmentLabel");
  });
});
