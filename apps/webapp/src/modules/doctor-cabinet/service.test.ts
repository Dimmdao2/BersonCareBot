import { describe, expect, it } from "vitest";
import { getDoctorWorkspaceState, getOverviewState } from "./service";

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

  describe("getOverviewState", () => {
    it("returns myDay with numeric fields", () => {
      const overview = getOverviewState();
      expect(overview.myDay).toHaveProperty("appointmentsToday", 0);
      expect(overview.myDay).toHaveProperty("cancellationsToday", 0);
      expect(overview.myDay).toHaveProperty("reschedulesToday", 0);
    });

    it("returns arrays for nearestAppointments, requireAttention, recentEvents", () => {
      const overview = getOverviewState();
      expect(Array.isArray(overview.nearestAppointments)).toBe(true);
      expect(Array.isArray(overview.requireAttention)).toBe(true);
      expect(Array.isArray(overview.recentEvents)).toBe(true);
    });

    it("returns quickActions with hrefs to doctor sections", () => {
      const overview = getOverviewState();
      expect(Array.isArray(overview.quickActions)).toBe(true);
      expect(overview.quickActions.length).toBeGreaterThan(0);
      expect(overview.quickActions.some((a) => a.href === "/app/doctor/clients")).toBe(true);
      expect(overview.quickActions.some((a) => a.href === "/app/doctor/appointments")).toBe(true);
    });
  });
});
