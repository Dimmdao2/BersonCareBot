import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebPushSubscriptionPayloadV1 } from "./ports";

const sendNotificationMock = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
}));

const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/logging/logger", () => ({
  logger: { info: loggerInfoMock, warn: loggerWarnMock, error: vi.fn(), debug: vi.fn() },
}));

import { sendWebPushToSubscriptions } from "./sendWebPushToSubscriptions";

const sub: WebPushSubscriptionPayloadV1 = {
  endpoint: "https://push.example/ep",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

/** Default test user ID matching the guard's DEV_REDIRECT_WEB_PUSH_USER_ID default. */
const TEST_USER_ID = "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0";

describe("sendWebPushToSubscriptions onAttempt", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    // Unit tests for send logic opt into delivery by identifying as the test user.
    // This mirrors what callers must do in non-production environments.
    delete process.env.ALLOW_DEV_WEB_PUSH;
    delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  });

  afterEach(() => {
    delete process.env.ALLOW_DEV_WEB_PUSH;
    delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  });

  it("calls onAttempt with success", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const attempts: unknown[] = [];
    await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: {
        title: "t",
        body: "b",
        url: "https://x",
        trackingId: "track-1",
        pushKind: "warmup",
        warmupSloganKey: "move_now",
      },
      onSubscriptionDead: async () => {},
      onAttempt: (r) => {
        attempts.push(r);
      },
      logContext: { userId: TEST_USER_ID },
    });
    expect(attempts).toEqual([{ status: "success", endpointHash: expect.any(String), providerStatusCode: 201 }]);
    const sentBody = JSON.parse(sendNotificationMock.mock.calls[0]![1] as string) as Record<string, string>;
    expect(sentBody.trackingId).toBe("track-1");
    expect(sentBody.warmupSloganKey).toBe("move_now");
  });

  it("calls onAttempt with provider_410 and deactivates subscription", async () => {
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(err);
    const dead: string[] = [];
    const attempts: unknown[] = [];
    await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async (ep) => {
        dead.push(ep);
      },
      onAttempt: (r) => {
        attempts.push(r);
      },
      logContext: { userId: TEST_USER_ID },
    });
    expect(dead).toEqual([sub.endpoint]);
    expect(attempts[0]).toMatchObject({ status: "failed", reason: "provider_410", providerStatusCode: 410 });
  });

  it("does not emit per-subscription success info when verbose is off", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      logContext: { userId: TEST_USER_ID },
    });
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });

  it("emits per-subscription success info when verbose is on", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      verbose: true,
      logContext: { userId: TEST_USER_ID },
    });
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
  });

  it("keeps provider error as warn regardless of verbose", async () => {
    const err = Object.assign(new Error("boom"), { statusCode: 500 });
    sendNotificationMock.mockRejectedValue(err);
    await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      verbose: false,
      logContext: { userId: TEST_USER_ID },
    });
    // In non-production the guard emits one warn (dev_web_push_test_user_allowed) + one
    // warn for the provider error → 2 warns total. Zero info regardless.
    const warnCalls = loggerWarnMock.mock.calls as unknown[][];
    const providerErrorWarn = warnCalls.some(
      (args) => typeof args[0] === "object" && (args[0] as Record<string, unknown>).event === "web_push_provider_response",
    );
    expect(providerErrorWarn).toBe(true);
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });
});

describe("sendWebPushToSubscriptions dev guard", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    delete process.env.ALLOW_DEV_WEB_PUSH;
    delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  });

  afterEach(() => {
    delete process.env.ALLOW_DEV_WEB_PUSH;
    delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  });

  it("suppresses delivery when callerUserId is undefined in non-production", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      // no logContext.userId → suppressed
    });
    expect(result).toEqual({ delivered: 0, errors: 0, deactivated: 0 });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("suppresses delivery for a non-test userId in non-production", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      logContext: { userId: "other-user-id-00000000-0000-0000-0000-000000000000" },
    });
    expect(result).toEqual({ delivered: 0, errors: 0, deactivated: 0 });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("delivers to the test user (default DEV_REDIRECT_WEB_PUSH_USER_ID) in non-production", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      logContext: { userId: "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0" },
    });
    expect(result.delivered).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("delivers to the test user when DEV_REDIRECT_WEB_PUSH_USER_ID is overridden via env", async () => {
    process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = "custom-test-user-id";
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      logContext: { userId: "custom-test-user-id" },
    });
    expect(result.delivered).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses the default test user when DEV_REDIRECT_WEB_PUSH_USER_ID is overridden to a different id", async () => {
    process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = "another-test-id";
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      // caller is the Дмитрий default — no longer the test user
      logContext: { userId: "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0" },
    });
    expect(result).toEqual({ delivered: 0, errors: 0, deactivated: 0 });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("ALLOW_DEV_WEB_PUSH=1 bypasses guard entirely and delivers to all callers", async () => {
    process.env.ALLOW_DEV_WEB_PUSH = "1";
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
    const result = await sendWebPushToSubscriptions({
      subscriptions: [sub],
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      vapidSubject: "mailto:test@example.com",
      payload: { title: "t", body: "b", url: "https://x" },
      onSubscriptionDead: async () => {},
      // no userId — bypassed entirely by ALLOW_DEV_WEB_PUSH=1
    });
    expect(result.delivered).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });
});
