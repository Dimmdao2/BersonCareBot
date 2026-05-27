import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebPushSubscriptionPayloadV1 } from "./ports";

const sendNotificationMock = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
}));

import { sendWebPushToSubscriptions } from "./sendWebPushToSubscriptions";

const sub: WebPushSubscriptionPayloadV1 = {
  endpoint: "https://push.example/ep",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

describe("sendWebPushToSubscriptions onAttempt", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
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
    });
    expect(dead).toEqual([sub.endpoint]);
    expect(attempts[0]).toMatchObject({ status: "failed", reason: "provider_410", providerStatusCode: 410 });
  });
});
