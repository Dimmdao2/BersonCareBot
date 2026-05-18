import webpush from "web-push";
import type { WebPushSubscriptionPayloadV1 } from "@/modules/web-push/ports";

export type WebPushClientPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/**
 * Отправка Web Push всем подпискам пользователя. 410/404 — вызывает onSubscriptionDead.
 */
export async function sendWebPushToSubscriptions(params: {
  subscriptions: WebPushSubscriptionPayloadV1[];
  vapidPublicKey: string;
  vapidPrivateKey: string;
  /** mailto: для VAPID subject */
  vapidSubject: string;
  payload: WebPushClientPayload;
  onSubscriptionDead: (endpoint: string) => Promise<void>;
}): Promise<{ delivered: number; errors: number }> {
  const { subscriptions, vapidPublicKey, vapidPrivateKey, vapidSubject, payload, onSubscriptionDead } = params;
  if (subscriptions.length === 0) return { delivered: 0, errors: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.tag ? { tag: payload.tag } : {}),
  });

  let delivered = 0;
  let errors = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        body,
        {
          TTL: 86_400,
          vapidDetails: {
            subject: vapidSubject,
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey,
          },
        },
      );
      delivered += 1;
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await onSubscriptionDead(sub.endpoint);
      }
      errors += 1;
    }
  }

  return { delivered, errors };
}
