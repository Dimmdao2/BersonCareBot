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

  it("doctor subscriber profile page default export is async component (stage 9)", async () => {
    const mod = await import("@/app/app/doctor/subscribers/[userId]/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("buildAppDeps doctorClients listClients returns array", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const list = await deps.doctorClients.listClients({});
    expect(Array.isArray(list)).toBe(true);
  });

  it("buildAppDeps doctorClients listClients accepts filters", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const list = await deps.doctorClients.listClients({
      search: "test",
      hasTelegram: true,
      hasMax: false,
      hasUpcomingAppointment: true,
    });
    expect(Array.isArray(list)).toBe(true);
  });

  it("buildAppDeps doctorClients getClientProfile returns null for unknown userId", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const profile = await deps.doctorClients.getClientProfile("unknown-user-id-999");
    expect(profile).toBeNull();
  });

  it("DoctorClientsPanel and ClientsFilters are client components", async () => {
    const panel = await import("@/app/app/doctor/clients/DoctorClientsPanel");
    const filters = await import("@/app/app/doctor/clients/ClientsFilters");
    expect(typeof panel.DoctorClientsPanel).toBe("function");
    expect(typeof filters.ClientsFilters).toBe("function");
  });

  it("ClientListLink and ClientProfileCard are defined", async () => {
    const link = await import("@/app/app/doctor/clients/ClientListLink");
    const card = await import("@/app/app/doctor/clients/ClientProfileCard");
    expect(typeof link.ClientListLink).toBe("function");
    expect(typeof card.ClientProfileCard).toBe("function");
  });
});
