import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerRuntimeBool, loggerInfo } = vi.hoisted(() => ({
  getServerRuntimeBool: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getServerRuntimeBool,
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: { info: loggerInfo },
}));

import { logAuthRouteTiming } from "./authRouteObservability";

describe("logAuthRouteTiming", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    getServerRuntimeBool.mockReset();
    loggerInfo.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the server-only flag and logs when enabled", async () => {
    getServerRuntimeBool.mockResolvedValue(true);

    logAuthRouteTiming({
      route: "auth/test",
      request: new Request("https://example.test/api/auth/test"),
      startedAt: Date.now(),
      status: 200,
      outcome: "ok",
    });

    await vi.waitFor(() => expect(loggerInfo).toHaveBeenCalledTimes(1));
    expect(getServerRuntimeBool).toHaveBeenCalledWith("debug_forward_to_admin");
  });

  it("does not log when the server-only flag is disabled", async () => {
    getServerRuntimeBool.mockResolvedValue(false);

    logAuthRouteTiming({
      route: "auth/test",
      request: new Request("https://example.test/api/auth/test"),
      startedAt: Date.now(),
      status: 200,
      outcome: "ok",
    });

    await vi.waitFor(() => expect(getServerRuntimeBool).toHaveBeenCalledTimes(1));
    expect(loggerInfo).not.toHaveBeenCalled();
  });
});
