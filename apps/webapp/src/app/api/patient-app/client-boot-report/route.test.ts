import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensurePortsMock, fallbackEnabledMock, rateLimitMock, resolveKeyMock, infoMock, warnMock, errorMock } = vi.hoisted(() => ({
  ensurePortsMock: vi.fn(),
  fallbackEnabledMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveKeyMock: vi.fn(),
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock("@/app-layer/di/bindAuthModulePorts", () => ({ ensureAuthModulePortsBound: ensurePortsMock }));
vi.mock("@/modules/auth/clientBootReportRateLimit", () => ({
  isClientBootReportRateLimitedByKey: rateLimitMock,
  resolveClientBootReportRateLimitClientKey: resolveKeyMock,
}));
vi.mock("@/modules/auth/unsupportedClientFallback", () => ({
  getUnsupportedClientFallbackEnabled: fallbackEnabledMock,
}));
vi.mock("@/infra/logging/logger", () => ({
  logger: { info: infoMock, warn: warnMock, error: errorMock },
}));

import { POST } from "./route";

const validPayload = {
  entrySurface: "browser",
  correlationId: "bc-correlation-1234567890",
  timingMs: 10_000,
  client: {
    osFamily: "ios",
    osMajor: 15,
    browserFamily: "safari",
    browserMajor: 15,
    supportBucket: "within_matrix",
    isInAppWebView: false,
  },
  failureSignals: {
    moduleExecuted: false,
    reactMounted: false,
    failureKind: "module_never_executed",
    capturedError: "none",
    swState: "available",
    storageBucket: "unknown",
    featureProbes: { fetch: true, promise: true, serviceWorker: true, storageEstimate: false },
  },
};

function request(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/patient-app/client-boot-report", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "192.0.2.4", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/patient-app/client-boot-report", () => {
  beforeEach(() => {
    ensurePortsMock.mockReset();
    fallbackEnabledMock.mockReset().mockResolvedValue(true);
    rateLimitMock.mockReset().mockResolvedValue(false);
    resolveKeyMock.mockReset().mockReturnValue({ ok: true, key: "192.0.2.4" });
    infoMock.mockReset();
    warnMock.mockReset();
    errorMock.mockReset();
  });

  it("keeps the telemetry ingress dormant while the rollout flag is disabled", async () => {
    fallbackEnabledMock.mockResolvedValue(false);
    const response = await POST(request(validPayload));
    expect(response.status).toBe(404);
    expect(resolveKeyMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("accepts only the minimized report and emits a structured info signal", async () => {
    const response = await POST(request(validPayload));
    expect(response.status).toBe(202);
    expect(ensurePortsMock).toHaveBeenCalledOnce();
    expect(rateLimitMock).toHaveBeenCalledWith("192.0.2.4");
    expect(infoMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      outcome: "observed",
    }));
    expect(errorMock).not.toHaveBeenCalled();
  });

  it.each(["telegramId", "integratorUserId", "userId", "token", "subject", "rawUa", "stack", "body"])(
    "rejects forbidden or unknown raw field %s without logging its value",
    async (field) => {
      const response = await POST(request({ ...validPayload, [field]: "secret-value" }));
      expect(response.status).toBe(400);
      expect(infoMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
    },
  );

  it("rejects nested unknown fields and an oversized body", async () => {
    const nested = await POST(request({
      ...validPayload,
      failureSignals: { ...validPayload.failureSignals, stack: "raw-stack" },
    }));
    expect(nested.status).toBe(400);

    const oversized = await POST(request("x".repeat(4_097)));
    expect(oversized.status).toBe(413);
  });

  it("rate limits by the trusted resolved key with warn only", async () => {
    rateLimitMock.mockResolvedValue(true);
    const response = await POST(request(validPayload));
    expect(response.status).toBe(429);
    expect(warnMock).toHaveBeenCalledWith({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      outcome: "rate_limited",
    });
    expect(infoMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("fails closed when the trusted proxy identity is missing", async () => {
    resolveKeyMock.mockReturnValue({ ok: false, reason: "missing_x_real_ip" });
    const response = await POST(request(validPayload));
    expect(response.status).toBe(503);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
