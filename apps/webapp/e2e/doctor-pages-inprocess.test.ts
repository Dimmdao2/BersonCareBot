/**
 * E2E (in-process): doctor cabinet wiring (без повторных import страниц — см. smoke-app-router-rsc-pages-inprocess).
 */
import { describe, expect, it } from "vitest";

describe("doctor pages e2e (in-process)", () => {
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

  it("buildAppDeps doctorMessaging listAllMessages returns paged result", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const list = await deps.doctorMessaging.listAllMessages({ pageSize: 50 });
    expect(Array.isArray(list.items)).toBe(true);
    expect(typeof list.total).toBe("number");
  });

  it("DoctorSupportInbox and DoctorChatPanel are client components", async () => {
    const inbox = await import("@/app/app/doctor/messages/DoctorSupportInbox");
    const chatPanel = await import("@/modules/messaging/components/DoctorChatPanel");
    expect(typeof inbox.DoctorSupportInbox).toBe("function");
    expect(typeof chatPanel.DoctorChatPanel).toBe("function");
  });
});
