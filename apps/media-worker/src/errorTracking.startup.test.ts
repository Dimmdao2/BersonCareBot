import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, readMock, order } = vi.hoisted(() => ({
  initMock: vi.fn(),
  readMock: vi.fn(),
  order: [] as string[],
}));

vi.mock("@bersoncare/error-tracking", () => ({
  captureErrorTrackingException: vi.fn(),
  closeErrorTracking: vi.fn(async () => true),
  initErrorTracking: initMock,
}));
vi.mock("./serverRuntimeConfig.js", () => ({ readServerRuntimeString: readMock }));

import { runMediaWorkerStartupGate } from "./errorTracking.js";

const pool = {} as unknown as Pool;

describe("media-worker tracker/readiness order", () => {
  beforeEach(() => {
    order.length = 0;
    initMock.mockReset().mockImplementation(async () => {
      order.push("tracker_initialized");
      return { enabled: true, release: "test" };
    });
    readMock.mockReset().mockImplementation(async (_pool: Pool, key: string) => (
      key === "error_tracking_enabled" ? "true" : "https://public@example.test/1"
    ));
  });

  it("initializes the tracker before executing error-prone readiness", async () => {
    await runMediaWorkerStartupGate(pool, async () => {
      order.push("readiness");
    });
    expect(order).toEqual(["tracker_initialized", "readiness"]);
    expect(readMock).toHaveBeenCalledTimes(2);
  });

  it("has initialized tracking before an early readiness failure propagates", async () => {
    const failure = new Error("early_readiness_failure");
    await expect(runMediaWorkerStartupGate(pool, async () => {
      order.push("readiness_failed");
      throw failure;
    })).rejects.toBe(failure);
    expect(order).toEqual(["tracker_initialized", "readiness_failed"]);
  });

  it("keeps readiness fail-open when optional config loading fails", async () => {
    readMock.mockRejectedValue(new Error("runtime_config_unavailable"));
    await runMediaWorkerStartupGate(pool, async () => {
      order.push("readiness");
    });
    expect(initMock).not.toHaveBeenCalled();
    expect(order).toEqual(["readiness"]);
  });
});
