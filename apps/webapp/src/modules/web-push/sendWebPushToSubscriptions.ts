import webpush from "web-push";
import { logger } from "@/infra/logging/logger";
import { hashWebPushEndpoint } from "@/modules/patient-notifications/hashWebPushEndpoint";
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
export type WebPushDeliveryAttemptResult = {
  status: "success" | "failed";
  endpointHash: string;
  providerStatusCode?: number;
  reason?: "provider_404" | "provider_410" | "provider_error" | "send_error";
  errorMessage?: string;
};

export async function sendWebPushToSubscriptions(params: {
  subscriptions: WebPushSubscriptionPayloadV1[];
  vapidPublicKey: string;
  vapidPrivateKey: string;
  /** mailto: для VAPID subject */
  vapidSubject: string;
  payload: WebPushClientPayload;
  onSubscriptionDead: (endpoint: string) => Promise<void>;
  onAttempt?: (result: WebPushDeliveryAttemptResult) => void | Promise<void>;
  logContext?: {
    userId?: string;
    topicCode?: string;
    occurrenceId?: string;
  };
}): Promise<{ delivered: number; errors: number; deactivated: number }> {
  const { subscriptions, vapidPublicKey, vapidPrivateKey, vapidSubject, payload, onSubscriptionDead, onAttempt, logContext } =
    params;
  if (subscriptions.length === 0) return { delivered: 0, errors: 0, deactivated: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.tag ? { tag: payload.tag } : {}),
  });

  let delivered = 0;
  let errors = 0;
  let deactivated = 0;

  for (const sub of subscriptions) {
    const endpointHash = hashWebPushEndpoint(sub.endpoint);
    try {
      const result = await webpush.sendNotification(
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
      await onAttempt?.({
        status: "success",
        endpointHash,
        providerStatusCode: result?.statusCode,
      });
      logger.info(
        {
          event: "web_push_provider_response",
          outcome: "ok",
          statusCode: result?.statusCode,
          endpointHash,
          ...logContext,
        },
        "web push provider response",
      );
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 410 || status === 404) {
        await onSubscriptionDead(sub.endpoint);
        deactivated += 1;
        const reason = status === 410 ? "provider_410" : "provider_404";
        await onAttempt?.({
          status: "failed",
          endpointHash,
          providerStatusCode: status,
          reason,
          errorMessage: message,
        });
        logger.info(
          {
            event: "web_push_provider_response",
            outcome: "subscription_dead",
            statusCode: status,
            endpointHash,
            ...logContext,
          },
          "web push subscription deactivated",
        );
      } else {
        await onAttempt?.({
          status: "failed",
          endpointHash,
          providerStatusCode: typeof status === "number" ? status : undefined,
          reason: "provider_error",
          errorMessage: message,
        });
        logger.warn(
          {
            event: "web_push_provider_response",
            outcome: "error",
            statusCode: status ?? null,
            endpointHash,
            error: message,
            ...logContext,
          },
          "web push provider error",
        );
      }
      errors += 1;
    }
  }

  return { delivered, errors, deactivated };
}
