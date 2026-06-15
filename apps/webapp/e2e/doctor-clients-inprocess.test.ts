/**
 * E2E (in-process): doctor clients list and profile wiring via buildAppDeps.
 * RSC-страницы — в smoke-app-router-rsc-pages-inprocess.
 */
import { describe, expect, it } from "vitest";

describe("doctor clients e2e (in-process)", () => {
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

  it("PatientsPageClient is a client component (unified patients list)", async () => {
    const mod = await import("@/app/app/doctor/patients/PatientsPageClient");
    expect(typeof mod.PatientsPageClient).toBe("function");
  });

  it("ClientProfileCard and doctorClientProfileHref are defined", async () => {
    const card = await import("@/app/app/doctor/clients/ClientProfileCard");
    const href = await import("@/app/app/doctor/clients/doctorClientProfileHref");
    expect(typeof card.ClientProfileCard).toBe("function");
    expect(typeof href.doctorClientProfileHref).toBe("function");
  });

  it("ClientBookingHistoryPanel and AppointmentStaffCommentsSection are defined", async () => {
    const history = await import("@/app/app/doctor/clients/ClientBookingHistoryPanel");
    const comments = await import("@/app/app/doctor/clients/AppointmentStaffCommentsSection");
    expect(typeof history.ClientBookingHistoryPanel).toBe("function");
    expect(typeof comments.AppointmentStaffCommentsSection).toBe("function");
  });
});
