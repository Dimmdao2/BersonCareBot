import webpush from "web-push";
import { logger } from "@/infra/logging/logger";
import { hashWebPushEndpoint } from "@/modules/patient-notifications/hashWebPushEndpoint";
import type { WebPushSubscriptionPayloadV1 } from "@/modules/web-push/ports";

export type WebPushClientPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  trackingId?: string;
  topicCode?: string | null;
  intentType?: string | null;
  pushKind?: string | null;
  warmupSloganKey?: string | null;
  /** Reminder occurrence id — enables snooze/skip action buttons in the service worker. */
  occurrenceId?: string | null;
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
  /** Gate per-subscription success/deactivation `info` logs behind admin verbose flag. Provider errors stay `warn`. */
  verbose?: boolean;
  logContext?: {
    userId?: string;
    topicCode?: string;
    occurrenceId?: string;
  };
}): Promise<{ delivered: number; errors: number; deactivated: number }> {
  const { subscriptions, vapidPublicKey, vapidPrivateKey, vapidSubject, payload, onSubscriptionDead, onAttempt, verbose, logContext } =
    params;
  if (subscriptions.length === 0) return { delivered: 0, errors: 0, deactivated: 0 };

  // S16 — DEV SECONDARY SAFETY GUARD (G2, retired as primary sink).
  //
  // All 7 web-push messaging legs (S14a–S14g) now route through the integrator dispatchPort,
  // which applies `applyPreForkDevRedirect` (G1) before adapter selection → the
  // WebPushDeliveryAdapter is only reached with test-user recipients. This function has 0 live
  // business-logic callers; it is kept only as a secondary belt-and-suspenders layer for any
  // hypothetical future direct callers.
  //
  // Strategy: DELIVER only to the test user (same source-of-truth as the integrator G1 redirect —
  // env DEV_REDIRECT_WEB_PUSH_USER_ID, default «Дмитрий Берсон» 1c312a64-fab8-4b75-b24e-88a1d6ebe4e0).
  // All other subscriptions are SUPPRESSED. NEVER reaches a real endpoint in dev.
  //
  // ALLOW_DEV_WEB_PUSH=1 bypasses this guard entirely (e.g. for manual E2E runs with a real device).
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_WEB_PUSH !== "1") {
    const testUserId =
      process.env.DEV_REDIRECT_WEB_PUSH_USER_ID?.trim() || "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0";
    const callerUserId = logContext?.userId;

    // If the caller userId does NOT match the test user, suppress entirely.
    if (!callerUserId || callerUserId !== testUserId) {
      logger.warn(
        {
          scope: "web_push",
          event: "dev_web_push_suppressed",
          count: subscriptions.length,
          userId: callerUserId ?? null,
          testUserId,
          topicCode: logContext?.topicCode,
        },
        "[web-push] DEV suppress: caller is not the test user — not sending to real subscriptions in non-production",
      );
      return { delivered: 0, errors: 0, deactivated: 0 };
    }

    // Caller IS the test user — allow all their subscriptions through.
    logger.warn(
      {
        scope: "web_push",
        event: "dev_web_push_test_user_allowed",
        count: subscriptions.length,
        userId: callerUserId,
        topicCode: logContext?.topicCode,
      },
      "[web-push] DEV: delivering to test user's subscriptions (caller matches DEV_REDIRECT_WEB_PUSH_USER_ID)",
    );
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.tag ? { tag: payload.tag } : {}),
    ...(payload.trackingId ? { trackingId: payload.trackingId } : {}),
    ...(payload.topicCode ? { topicCode: payload.topicCode } : {}),
    ...(payload.intentType ? { intentType: payload.intentType } : {}),
    ...(payload.pushKind ? { pushKind: payload.pushKind } : {}),
    ...(payload.warmupSloganKey ? { warmupSloganKey: payload.warmupSloganKey } : {}),
    ...(payload.occurrenceId ? { occurrenceId: payload.occurrenceId } : {}),
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
      if (verbose) {
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
      }
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
        if (verbose) {
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
        }
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
