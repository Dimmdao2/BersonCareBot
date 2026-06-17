/**
 * Web-Push DeliveryAdapter — wires the integrator web-push sink into the dispatchPort
 * pipeline (PLAN S14).
 *
 * canHandle: intent.type === 'message.send' && channel === 'web_push'
 * send:
 *   1. Reads `recipient.pushUserId` from the intent payload.
 *   2. Fetches active subscriptions + VAPID credentials via `webPushAccessPort` (S13 Model β).
 *   3. Calls `sendWebPushViaProvider` (the moved S6 sink in client.ts) for each subscription.
 *   4. On 410/404 from the push provider, calls `webPushAccessPort.deleteSubscriptionByEndpoint`
 *      to clean up dead subscriptions (preserves the `onSubscriptionDead` contract from
 *      the webapp's `sendWebPushToSubscriptions`).
 *   5. Reports delivery attempt results for analytics (mirrors `onAttempt` from S6).
 *
 * SAFETY: This adapter is only reachable via `dispatchOutgoing`, which applies
 * `applyPreForkDevRedirect` BEFORE adapter selection (G1 chokepoint). In dev
 * (DEV_DELIVERY_REDIRECT=1 or NODE_ENV !== 'production'), the redirect runs first and this
 * adapter's `canHandle` returns false — so `sendWebPushViaProvider` is NEVER called with a
 * real recipient.
 * S16: G2 guard in `sendWebPushToSubscriptions.ts` is now retired as primary sink — all 7
 * S14 legs (S14a–S14g) complete, 0 live callers. Kept as secondary safety layer only.
 */
import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent, WebPushAccessPort } from '../../kernel/contracts/index.js';
import { readChannel } from '../../infra/adapters/channelRouting.js';
import { logger } from '../../infra/observability/logger.js';
import { sendWebPushViaProvider } from './client.js';

type WebPushDeliveryPayload = {
  recipient?: { pushUserId?: unknown };
  message?: { text?: unknown };
  title?: unknown;
  url?: unknown;
  pushExtras?: {
    tag?: string;
    trackingId?: string;
    topicCode?: string | null;
    intentType?: string | null;
    pushKind?: string | null;
    warmupSloganKey?: string | null;
  };
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function createWebPushDeliveryAdapter(deps: {
  webPushAccessPort: WebPushAccessPort;
}): DeliveryAdapter {
  const { webPushAccessPort } = deps;

  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type !== 'message.send') return false;
      return readChannel(intent) === 'web_push';
    },

    async send(intent: OutgoingIntent): Promise<DeliverySendResult> {
      if (intent.type !== 'message.send') return {};

      const payload = intent.payload as WebPushDeliveryPayload;

      const pushUserId = asString(payload.recipient?.pushUserId);
      if (!pushUserId) {
        const err = new Error('WEB_PUSH_PAYLOAD_INVALID: recipient.pushUserId is required');
        (err as { code?: number }).code = 400;
        throw err;
      }

      // Fetch subscriptions + VAPID in parallel (Model β — M2M read from webapp).
      const [subscriptions, vapid] = await Promise.all([
        webPushAccessPort.getSubscriptionsForUser(pushUserId),
        webPushAccessPort.getVapidCredentials(),
      ]);

      if (!vapid) {
        logger.warn(
          { scope: 'web_push', event: 'web_push_vapid_missing', pushUserId },
          '[web-push] VAPID credentials not configured or unavailable — skipping push',
        );
        return {};
      }

      if (!subscriptions || subscriptions.length === 0) {
        logger.info(
          { scope: 'web_push', event: 'web_push_no_subscriptions', pushUserId },
          '[web-push] no active subscriptions for user — skipping',
        );
        return {};
      }

      const body = asString(payload.message?.text) ?? '';
      const title = asString(payload.title) ?? 'BersonCare';
      const url = asString(payload.url) ?? '/';
      const extras = payload.pushExtras ?? {};

      const result = await sendWebPushViaProvider({
        subscriptions,
        vapid,
        payload: {
          title,
          body,
          url,
          ...(extras.tag !== undefined ? { tag: extras.tag } : {}),
          ...(extras.trackingId !== undefined ? { trackingId: extras.trackingId } : {}),
          ...(extras.topicCode !== undefined ? { topicCode: extras.topicCode } : {}),
          ...(extras.intentType !== undefined ? { intentType: extras.intentType } : {}),
          ...(extras.pushKind !== undefined ? { pushKind: extras.pushKind } : {}),
          ...(extras.warmupSloganKey !== undefined ? { warmupSloganKey: extras.warmupSloganKey } : {}),
        },
        onSubscriptionDead: async (endpoint) => {
          const deleted = await webPushAccessPort.deleteSubscriptionByEndpoint(endpoint);
          if (!deleted) {
            logger.warn(
              { scope: 'web_push', event: 'web_push_dead_sub_cleanup_failed', pushUserId },
              '[web-push] failed to clean up dead subscription via M2M',
            );
          }
        },
        onAttempt: async (attemptResult) => {
          // Delivery-attempt analytics: mirrors webapp's `onAttempt` analytics callback.
          // For now, log the attempt; future steps may route through delivery.attempt.log.
          if (attemptResult.status === 'failed') {
            logger.warn(
              {
                scope: 'web_push',
                event: 'web_push_attempt_failed',
                pushUserId,
                endpointHash: attemptResult.endpointHash,
                reason: attemptResult.reason,
                providerStatusCode: attemptResult.providerStatusCode,
                errorMessage: attemptResult.errorMessage,
              },
              '[web-push] push attempt failed',
            );
          }
        },
      });

      logger.info(
        {
          scope: 'web_push',
          event: 'web_push_sent',
          pushUserId,
          delivered: result.delivered,
          errors: result.errors,
          deactivated: result.deactivated,
        },
        '[web-push] push delivery complete',
      );

      return {};
    },
  };
}
