/**
 * E2E (in-process): all doctor cabinet pages and messaging listAll.
 */
import { describe, expect, it } from "vitest";

describe("doctor pages e2e (in-process)", () => {
  it("doctor overview page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor appointments page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/appointments/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor messages page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/messages/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor broadcasts page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/broadcasts/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor stats page default export is async component", async () => {
    const mod = await import("@/app/app/doctor/stats/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor subscribers page default export is async component (stage 9)", async () => {
    const mod = await import("@/app/app/doctor/subscribers/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("buildAppDeps doctorStats getDashboardMetrics returns patient and appointment metrics (stage 9)", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const m = await deps.doctorStats.getDashboardMetrics();
    expect(m.patients).toMatchObject({
      total: expect.any(Number),
      onSupport: expect.any(Number),
      visitedThisMonth: expect.any(Number),
    });
    expect(m.appointments).toMatchObject({
      futureActive: expect.any(Number),
      recordsInMonthTotal: expect.any(Number),
      cancellationsInMonth: expect.any(Number),
    });
  });

  it("buildAppDeps doctorMessaging listAllMessages returns array", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const list = await deps.doctorMessaging.listAllMessages(50);
    expect(Array.isArray(list)).toBe(true);
  });

  it("NewMessageForm and SendMessageForm are client components", async () => {
    const newForm = await import("@/app/app/doctor/messages/NewMessageForm");
    const sendForm = await import("@/app/app/doctor/clients/[userId]/SendMessageForm");
    expect(typeof newForm.NewMessageForm).toBe("function");
    expect(typeof sendForm.SendMessageForm).toBe("function");
  });
});
