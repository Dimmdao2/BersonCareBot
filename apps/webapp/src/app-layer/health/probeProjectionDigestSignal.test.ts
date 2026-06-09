import { beforeEach, describe, expect, it, vi } from "vitest";

const proxyMock = vi.fn();

vi.mock("@/app-layer/health/proxyIntegratorProjectionHealth", () => ({
  proxyIntegratorProjectionHealth: () => proxyMock(),
}));

import { probeProjectionDigestSignal } from "./probeProjectionDigestSignal";

describe("probeProjectionDigestSignal", () => {
  beforeEach(() => {
    proxyMock.mockReset();
  });

  it("maps ok snapshot with retries to degraded probe status", async () => {
    proxyMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        deadCount: 0,
        retriesOverThreshold: 2,
        oldestPendingAt: "2026-06-09T08:00:00.000Z",
      }),
    });
    const signal = await probeProjectionDigestSignal();
    expect(signal.probeStatus).toBe("degraded");
    expect(signal.retriesOverThreshold).toBe(2);
    expect(signal.oldestPendingAt).toBe("2026-06-09T08:00:00.000Z");
  });

  it("maps integrator unreachable to unreachable probe status", async () => {
    proxyMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "integrator_unreachable" }),
    });
    const signal = await probeProjectionDigestSignal();
    expect(signal.probeStatus).toBe("unreachable");
    expect(signal.deadCount).toBe(0);
  });
});
