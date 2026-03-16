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
    expect(deps).toHaveProperty("media");
  });

  it("media has upload, getUrl, getById", () => {
    const deps = buildAppDeps();
    expect(typeof deps.media.upload).toBe("function");
    expect(typeof deps.media.getUrl).toBe("function");
    expect(typeof deps.media.getById).toBe("function");
  });

  it("patientCabinet has getPatientCabinetState and getUpcomingAppointments", () => {
    const deps = buildAppDeps();
    expect(typeof deps.patientCabinet.getPatientCabinetState).toBe("function");
    expect(typeof deps.patientCabinet.getUpcomingAppointments).toBe("function");
    const state = deps.patientCabinet.getPatientCabinetState("user-1");
    expect(state).toHaveProperty("enabled");
    expect(state).toHaveProperty("reason");
  });

  it("auth has getCurrentSession, exchangeIntegratorToken, exchangeTelegramInitData, clearSession", () => {
    const deps = buildAppDeps();
    expect(typeof deps.auth.getCurrentSession).toBe("function");
    expect(typeof deps.auth.exchangeIntegratorToken).toBe("function");
    expect(typeof deps.auth.exchangeTelegramInitData).toBe("function");
    expect(typeof deps.auth.clearSession).toBe("function");
  });

  it("menu.getMenuForRole returns array for client", () => {
    const deps = buildAppDeps();
    const items = deps.menu.getMenuForRole("client");
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("diaries exposes listSymptomEntries, addSymptomEntry, listLfkSessions, addLfkSession", () => {
    const deps = buildAppDeps();
    expect(deps.diaries).toHaveProperty("listSymptomEntries");
    expect(deps.diaries).toHaveProperty("addSymptomEntry");
    expect(deps.diaries).toHaveProperty("listLfkSessions");
    expect(deps.diaries).toHaveProperty("addLfkSession");
    expect(typeof deps.diaries.listSymptomEntries).toBe("function");
    expect(typeof deps.diaries.addSymptomEntry).toBe("function");
    expect(typeof deps.diaries.listLfkSessions).toBe("function");
    expect(typeof deps.diaries.addLfkSession).toBe("function");
  });

  it("diaries list methods return Promise resolving to array", async () => {
    const deps = buildAppDeps();
    const entries = await deps.diaries.listSymptomEntries("build-deps-test-user");
    const sessions = await deps.diaries.listLfkSessions("build-deps-test-user");
    expect(Array.isArray(entries)).toBe(true);
    expect(Array.isArray(sessions)).toBe(true);
  });
});
