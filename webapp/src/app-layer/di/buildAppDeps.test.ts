import { describe, expect, it } from "vitest";
import { buildAppDeps } from "./buildAppDeps";

describe("buildAppDeps", () => {
  it("returns all required keys", () => {
    const deps = buildAppDeps();
    expect(deps).toHaveProperty("auth");
    expect(deps).toHaveProperty("users");
    expect(deps).toHaveProperty("menu");
    expect(deps).toHaveProperty("lessons");
    expect(deps).toHaveProperty("emergency");
    expect(deps).toHaveProperty("patientCabinet");
    expect(deps).toHaveProperty("doctorCabinet");
    expect(deps).toHaveProperty("purchases");
    expect(deps).toHaveProperty("diaries");
    expect(deps).toHaveProperty("health");
  });

  it("patientCabinet has getPatientCabinetState and getUpcomingAppointments", () => {
    const deps = buildAppDeps();
    expect(typeof deps.patientCabinet.getPatientCabinetState).toBe("function");
    expect(typeof deps.patientCabinet.getUpcomingAppointments).toBe("function");
    const state = deps.patientCabinet.getPatientCabinetState("user-1");
    expect(state).toHaveProperty("enabled");
    expect(state).toHaveProperty("reason");
  });

  it("auth has getCurrentSession, exchangeIntegratorToken, clearSession", () => {
    const deps = buildAppDeps();
    expect(typeof deps.auth.getCurrentSession).toBe("function");
    expect(typeof deps.auth.exchangeIntegratorToken).toBe("function");
    expect(typeof deps.auth.clearSession).toBe("function");
  });

  it("menu.getMenuForRole returns array for client", () => {
    const deps = buildAppDeps();
    const items = deps.menu.getMenuForRole("client");
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });
});
