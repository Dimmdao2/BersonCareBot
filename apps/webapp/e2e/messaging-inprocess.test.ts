/**
 * E2E (in-process): модуль сообщений этапа 8 — импорт UI и API без HTTP-сервера.
 */
import { describe, expect, it } from "vitest";

describe("messaging e2e (in-process)", () => {
  it("ChatView client module loads", async () => {
    const mod = await import("@/modules/messaging/components/ChatView");
    expect(typeof mod.ChatView).toBe("function");
  });

  it("patient messages API route exports GET/POST", async () => {
    const mod = await import("@/app/api/patient/messages/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });

  it("doctor messages conversations route exports GET", async () => {
    const mod = await import("@/app/api/doctor/messages/conversations/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("buildAppDeps includes messaging", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    expect(deps.messaging.patient).toBeDefined();
    expect(deps.messaging.doctorSupport).toBeDefined();
  });
});
