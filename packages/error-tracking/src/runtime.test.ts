import { describe, expect, it, vi } from "vitest";

import {
  closeErrorTracking,
  initErrorTrackingWithLoader,
  resolveErrorTrackingRelease,
  sanitizeErrorTrackingEvent,
  type ErrorTrackingSdkAdapter,
} from "./runtime.js";

function adapter(): ErrorTrackingSdkAdapter {
  return {
    init: vi.fn(),
    captureException: vi.fn(() => "event-id"),
    flush: vi.fn(async () => true),
    close: vi.fn(async () => true),
  };
}

const baseInput = {
  service: "integrator",
  processRole: "api",
  buildId: "build-123",
  nodeEnv: "production",
} as const;

describe("error tracking runtime", () => {
  it.each([
    { enabled: false, dsn: "http://public@example.test/1", reason: "disabled" },
    { enabled: true, dsn: "", reason: "invalid_dsn" },
    { enabled: true, dsn: "ftp://public@example.test/1", reason: "invalid_dsn" },
    { enabled: true, dsn: "https://example.test/1", reason: "invalid_dsn" },
  ] as const)("does not load the SDK for $reason", async ({ enabled, dsn, reason }) => {
    const load = vi.fn(async () => adapter());
    await expect(initErrorTrackingWithLoader({ ...baseInput, enabled, dsn }, load)).resolves.toMatchObject({
      enabled: false,
      reason,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("initializes errors-only SDK options after valid opt-in", async () => {
    const sdk = adapter();
    const load = vi.fn(async () => sdk);
    await expect(initErrorTrackingWithLoader({
      ...baseInput,
      enabled: true,
      dsn: "https://public@example.test/1",
    }, load)).resolves.toEqual({ enabled: true, release: "build-123" });
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({
      defaultIntegrations: false,
      integrations: [],
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      enableLogs: false,
      autoSessionTracking: false,
      sendDefaultPii: false,
      includeLocalVariables: false,
      attachStacktrace: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
    }));
    await closeErrorTracking();
  });

  it("rebuilds events from a closed allowlist and strips recursive PII", () => {
    const marker = "pii-marker@example.test";
    const event = {
      request: { headers: { authorization: marker }, data: { nested: [marker] } },
      user: { id: marker, email: marker },
      contexts: { organization: { id: marker } },
      extra: { patientPhone: marker },
      breadcrumbs: [{ message: marker }],
      exception: {
        values: [{
          type: "TypeError",
          value: marker,
          stacktrace: {
            frames: [
              { filename: `/srv/repo/apps/integrator/src/main.ts?token=${marker}`, function: "start", lineno: 42 },
              { filename: `/srv/node_modules/private/${marker}.js`, function: marker },
            ],
          },
        }],
      },
      tags: { capture_point: "integrator_http_error", organization_id: marker },
    };
    const sanitized = sanitizeErrorTrackingEvent(event, {
      service: "integrator",
      processRole: "api",
      release: "build-123",
    });
    expect(JSON.stringify(sanitized)).not.toContain(marker);
    expect(sanitized).toEqual({
      exception: { values: [{
        type: "TypeError",
        value: "[REDACTED]",
        stacktrace: { frames: [{ filename: "apps/integrator/src/main.ts", in_app: true, function: "start", lineno: 42 }] },
      }] },
      release: "build-123",
      tags: {
        service: "integrator",
        process_role: "api",
        capture_point: "integrator_http_error",
        release: "build-123",
      },
    });
  });

  it("resolves release from BUILD_ID, bounded git SHA, then dev/unknown", () => {
    expect(resolveErrorTrackingRelease({ buildId: "release-7", cwd: "/missing" })).toBe("release-7");
    expect(resolveErrorTrackingRelease({ buildId: "", cwd: process.cwd(), nodeEnv: "production" })).toMatch(/^[0-9a-f]{7,12}$/);
    expect(resolveErrorTrackingRelease({ buildId: "bad release", cwd: "/definitely/missing", nodeEnv: "development" })).toBe("dev");
    expect(resolveErrorTrackingRelease({ buildId: "", cwd: "/definitely/missing", nodeEnv: "production" })).toBe("unknown");
  });
});
