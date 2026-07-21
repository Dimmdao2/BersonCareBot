import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensurePortsMock, fallbackEnabledMock, rateLimitMock, infoMock, warnMock, errorMock } = vi.hoisted(() => ({
  ensurePortsMock: vi.fn(),
  fallbackEnabledMock: vi.fn(),
  rateLimitMock: vi.fn(),
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock("@/app-layer/di/bindAuthModulePorts", () => ({ ensureAuthModulePortsBound: ensurePortsMock }));
vi.mock("@/modules/auth/clientBootReportRateLimit", () => ({
  checkClientBootReportRateLimit: rateLimitMock,
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

type StreamingRequestInit = RequestInit & { duplex: "half" };

function streamingRequest(chunks: string[], headers?: HeadersInit) {
  const encoder = new TextEncoder();
  const pending = chunks.map((chunk) => encoder.encode(chunk));
  const state = { cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = pending.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const init: StreamingRequestInit = {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "192.0.2.4", ...headers },
    body,
    duplex: "half",
  };
  return {
    request: new Request("http://localhost/api/patient-app/client-boot-report", init),
    state,
  };
}

describe("POST /api/patient-app/client-boot-report", () => {
  beforeEach(() => {
    ensurePortsMock.mockReset();
    fallbackEnabledMock.mockReset().mockResolvedValue(true);
    rateLimitMock.mockReset().mockResolvedValue("ok");
    infoMock.mockReset();
    warnMock.mockReset();
    errorMock.mockReset();
  });

  it("keeps the telemetry ingress dormant while the rollout flag is disabled", async () => {
    fallbackEnabledMock.mockResolvedValue(false);
    const response = await POST(request(validPayload));
    expect(response.status).toBe(404);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("accepts only the minimized report and emits a structured info signal", async () => {
    const response = await POST(request(validPayload));
    expect(response.status).toBe(202);
    expect(ensurePortsMock).toHaveBeenCalledOnce();
    expect(rateLimitMock).toHaveBeenCalledWith(expect.any(Request));
    expect(infoMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      outcome: "observed",
    }));
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("accepts a valid chunked Web Stream without Content-Length", async () => {
    const serialized = JSON.stringify(validPayload);
    const streamed = streamingRequest([
      serialized.slice(0, 25),
      serialized.slice(25),
    ], { "transfer-encoding": "chunked" });
    expect(streamed.request.headers.has("content-length")).toBe(false);

    const response = await POST(streamed.request);
    expect(response.status).toBe(202);
    expect(infoMock).toHaveBeenCalledOnce();
    expect(streamed.state.cancelled).toBe(false);
  });

  it("streams and validates the body when Content-Length is invalid", async () => {
    const streamed = streamingRequest([JSON.stringify(validPayload)], { "content-length": "9999-invalid" });
    const response = await POST(streamed.request);
    expect(response.status).toBe(202);
    expect(infoMock).toHaveBeenCalledOnce();
  });

  it("cancels a chunked body immediately after the byte cap is exceeded", async () => {
    const streamed = streamingRequest(["x".repeat(3_000), "y".repeat(1_097), "never-read"]);
    const response = await POST(streamed.request);
    expect(response.status).toBe(413);
    expect(streamed.state.cancelled).toBe(true);
    expect(infoMock).not.toHaveBeenCalled();
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

  it("rejects nested unknown fields and an oversized body without a declared length", async () => {
    const nested = await POST(request({
      ...validPayload,
      failureSignals: { ...validPayload.failureSignals, stack: "raw-stack" },
    }));
    expect(nested.status).toBe(400);

    const oversizedRequest = request("x".repeat(4_097));
    expect(oversizedRequest.headers.has("content-length")).toBe(false);
    const oversized = await POST(oversizedRequest);
    expect(oversized.status).toBe(413);
  });

  it("rate limits by the trusted resolved key with warn only", async () => {
    rateLimitMock.mockResolvedValue("rate_limited");
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
    rateLimitMock.mockResolvedValue("configuration_error");
    const response = await POST(request(validPayload));
    expect(response.status).toBe(503);
    expect(rateLimitMock).toHaveBeenCalledOnce();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
