/**
 * E2E (in-process): doctor clients list and profile wiring via buildAppDeps.
 */
import { describe, expect, it } from "vitest";

describe("doctor clients e2e (in-process)", () => {
  it("doctor clients list page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/clients/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor client profile page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/clients/[userId]/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("buildAppDeps doctorClients listClients returns array", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const list = await deps.doctorClients.listClients({});
    expect(Array.isArray(list)).toBe(true);
  });

  it("buildAppDeps doctorClients getClientProfile returns null for unknown userId", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const profile = await deps.doctorClients.getClientProfile("unknown-user-id-999");
    expect(profile).toBeNull();
  });
});
