import { describe, expect, it } from "vitest";
import { getDoctorWorkspaceState } from "./service";

describe("doctor-cabinet service", () => {
  it("returns status and message", () => {
    const state = getDoctorWorkspaceState();
    expect(state).toHaveProperty("status", "foundation");
    expect(state).toHaveProperty("message");
    expect(typeof state.message).toBe("string");
  });

  it("returns patientList array", () => {
    const state = getDoctorWorkspaceState();
    expect(Array.isArray(state.patientList)).toBe(true);
  });
});
