import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  INTEGRATOR_API_URL: "http://integrator.test",
}));

vi.mock("@/config/env", () => ({
  env: envMock,
}));

import { proxyIntegratorProjectionHealth } from "./proxyIntegratorProjectionHealth";

describe("proxyIntegratorProjectionHealth", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    envMock.INTEGRATOR_API_URL = "http://integrator.test";
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.clearAllMocks();
  });

  it("returns 503 when INTEGRATOR_API_URL is empty", async () => {
    envMock.INTEGRATOR_API_URL = "";
    const res = await proxyIntegratorProjectionHealth();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("integrator_url_not_configured");
  });

  it("proxies JSON from integrator", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          cancelledCount: 0,
          oldestPendingAt: null,
          processingCount: 0,
          retryDistribution: {},
          lastSuccessAt: null,
          retriesOverThreshold: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    const res = await proxyIntegratorProjectionHealth();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pendingCount: number };
    expect(body.pendingCount).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://integrator.test/health/projection",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("returns 503 when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as typeof fetch;
    const res = await proxyIntegratorProjectionHealth();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("integrator_unreachable");
  });
});
