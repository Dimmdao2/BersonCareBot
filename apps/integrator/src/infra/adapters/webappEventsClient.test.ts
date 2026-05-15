import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../observability/logger.js";

const { mockIntegratorWebhookSecret } = vi.hoisted(() => ({
  /** Min length for webhook HMAC; not a production secret. */
  mockIntegratorWebhookSecret: "test_mock_integrator_webhook_secret________",
}));

vi.mock("../../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    HOST: "127.0.0.1",
    PORT: 3000,
    DATABASE_URL: "postgres://localhost:5432/test",
    BOOKING_URL: "https://example.com",
    APP_BASE_URL: "https://webapp.test",
    CONTENT_SERVICE_BASE_URL: "",
    CONTENT_ACCESS_HMAC_SECRET: "",
    GOOGLE_CALENDAR_ENABLED: false,
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: "",
    GOOGLE_CALENDAR_ID: "",
    GOOGLE_REFRESH_TOKEN: "",
  },
  integratorWebhookSecret: () => mockIntegratorWebhookSecret,
  integratorWebappEntrySecret: () => mockIntegratorWebhookSecret,
}));

describe("createWebappEventsPort emit", () => {
  const originalFetch = globalThis.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  it("treats 202 with ok true as success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 202,
      text: async () => JSON.stringify({ ok: true, accepted: true }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "user.upserted",
      occurredAt: new Date().toISOString(),
      payload: { integratorUserId: "1" },
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
  });

  it("treats 200 with ok true as success (same contract as 202)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ ok: true, accepted: true }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "user.upserted",
      occurredAt: new Date().toISOString(),
      payload: { integratorUserId: "2" },
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("treats 202 without ok true as failure (integrator must not complete projection)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 202,
      text: async () => JSON.stringify({ ok: false, error: "busy" }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "diary.lfk.complex.created",
      occurredAt: new Date().toISOString(),
      payload: { userId: "u1", title: "t" },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(202);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "integrator_emit_body_reject",
        eventType: "diary.lfk.complex.created",
        httpStatus: 202,
        error: "busy",
      }),
      "webapp events emit: response ok is not true",
    );
  });

  it("treats 202 with missing ok field as failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 202,
      text: async () => JSON.stringify({ accepted: true }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "reminder.rule.upserted",
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(202);
  });

  it("logs and fails when response body is not valid JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "<html>not json</html>",
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "user.upserted",
      occurredAt: new Date().toISOString(),
      payload: { integratorUserId: "1" },
    });
    expect(result.ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "integrator_emit_body_reject",
        eventType: "user.upserted",
        httpStatus: 200,
      }),
      "webapp events emit: response body is not valid JSON",
    );
  });

  it("logs integrator_emit_body_reject when 200 has empty body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "",
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const result = await port.emit({
      eventType: "user.upserted",
      occurredAt: new Date().toISOString(),
      payload: { integratorUserId: "9" },
    });
    expect(result.ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "integrator_emit_body_reject",
        eventType: "user.upserted",
        httpStatus: 200,
      }),
      "webapp events emit: empty response body",
    );
  });
});

describe("createWebappEventsPort completeChannelLink", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prefers mergeReason over error when HTTP status is not ok (409)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        error: "conflict",
        mergeReason: "channel_link_claim_failed",
      }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const complete = port.completeChannelLink;
    if (!complete) throw new Error("expected completeChannelLink on port");
    const result = await complete({
      linkToken: "link_x",
      channelCode: "telegram",
      externalId: "99",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("channel_link_claim_failed");
  });

  it("falls back to error when mergeReason absent on failed HTTP", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false, error: "conflict" }),
    });
    const { createWebappEventsPort } = await import("./webappEventsClient.js");
    const port = createWebappEventsPort({ getAppBaseUrl: async () => "https://webapp.test" });
    const complete = port.completeChannelLink;
    if (!complete) throw new Error("expected completeChannelLink on port");
    const result = await complete({
      linkToken: "link_x",
      channelCode: "telegram",
      externalId: "99",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("conflict");
  });
});
