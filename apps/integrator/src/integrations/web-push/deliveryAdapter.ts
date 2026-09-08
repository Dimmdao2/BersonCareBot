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
 * SAFETY: this adapter is reachable only through `dispatchOutgoing`. Its single pre-provider
 * environment gate suppresses all local-DEV sends and, on deployed TEST, permits only the original
 * `TEST_ACCOUNT_WEB_PUSH_USER_IDS` recipient. It never redirects or rewrites the payload.
 * S16: G2 guard in `sendWebPushToSubscriptions.ts` is now retired as primary sink — all 7
 * S14 legs (S14a–S14g) complete, 0 live callers. Kept as secondary safety layer only.
 */
import type {
  DeliveryAdapter,
  DeliverySendResult,
  OutgoingIntent,
  WebPushAccessPort,
} from '../../kernel/contracts/index.js';
import { readChannel } from '../../infra/adapters/channelRouting.js';
import { logger } from '../../infra/observability/logger.js';
import { sendWebPushViaProvider } from './client.js';
import { sendRuStoreUniversalPush } from './rustoreUniversalClient.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';

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
    occurrenceId?: string | null;
    pushSurface?: 'therapygo' | 'therapysto';
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
      const title = asString(payload.title);
      if (!title) {
        const err = new Error('WEB_PUSH_PAYLOAD_INVALID: title is required');
        (err as { code?: number }).code = 400;
        throw err;
      }
      const organizationId = getCurrentOrganizationPrincipalId();
      if (!organizationId) {
        throw new Error('WEB_PUSH_ORGANIZATION_PRINCIPAL_REQUIRED');
      }

      // Fetch subscriptions + VAPID in parallel (Model β — M2M read from webapp).
      const [subscriptions, vapidResult, nativeTargets] = await Promise.all([
        webPushAccessPort.getSubscriptionsForUser(pushUserId, organizationId),
        webPushAccessPort.getVapidCredentials(organizationId).catch(() => null),
        webPushAccessPort.getNativeTargetsForUser(pushUserId, organizationId).catch(() => []),
      ]);

      if (subscriptions.length === 0 && nativeTargets.length === 0) {
        logger.info(
          { scope: 'web_push', event: 'web_push_no_subscriptions', pushUserId },
          '[web-push] no active subscriptions for user — skipping',
        );
        return {
          webPushOutcome: {
            status: 'skipped',
            reason: 'no_active_target',
            delivered: 0,
            errors: 0,
            deactivated: 0,
          },
        };
      }

      const body = asString(payload.message?.text) ?? '';
      const url = asString(payload.url) ?? '/';
      const extras = payload.pushExtras ?? {};

      const browserResult = vapidResult && subscriptions.length > 0 ? await sendWebPushViaProvider({
        subscriptions,
        vapid: vapidResult,
        payload: {
          title,
          body,
          url,
          ...(extras.tag !== undefined ? { tag: extras.tag } : {}),
          ...(extras.trackingId !== undefined ? { trackingId: extras.trackingId } : {}),
          ...(extras.topicCode !== undefined ? { topicCode: extras.topicCode } : {}),
          ...(extras.intentType !== undefined ? { intentType: extras.intentType } : {}),
          ...(extras.pushKind !== undefined ? { pushKind: extras.pushKind } : {}),
          ...(extras.warmupSloganKey !== undefined
            ? { warmupSloganKey: extras.warmupSloganKey }
            : {}),
          ...(extras.occurrenceId !== undefined ? { occurrenceId: extras.occurrenceId } : {}),
        },
        onSubscriptionDead: async (endpoint) => {
          const deleted = await webPushAccessPort.deleteSubscriptionByEndpoint(
            pushUserId,
            endpoint,
            organizationId,
          );
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
                providerErrorCode: attemptResult.providerErrorCode,
                errorMessage: attemptResult.errorMessage,
              },
              '[web-push] push attempt failed',
            );
          }
        },
      }) : { delivered: 0, errors: 0, deactivated: 0 };

      let nativeDelivered = 0; let nativeErrors = 0; let nativeDeactivated = 0;
      const nativeSurface = extras.pushSurface;
      for (const target of nativeTargets) {
        if (target.provider !== 'rustore' || (nativeSurface && target.appId !== nativeSurface)) continue;
        const config = await webPushAccessPort.getRuStoreConfig(target.appId, organizationId).catch(() => null);
        if (!config) continue;
        const result = await sendRuStoreUniversalPush({ config, token: target.token, data: { route: url, title, body, pushSurface: target.appId } });
        if (result.ok) nativeDelivered += 1;
        else { nativeErrors += 1; if (result.invalidToken && await webPushAccessPort.deactivateNativeTarget(target.id, organizationId)) nativeDeactivated += 1; }
      }
      const delivered = browserResult.delivered + nativeDelivered;
      const errors = browserResult.errors + nativeErrors;

      logger.info(
        {
          scope: 'web_push',
          event: 'web_push_sent',
          pushUserId,
          delivered,
          errors,
          deactivated: browserResult.deactivated + nativeDeactivated,
          transports: { browser: { delivered: browserResult.delivered, errors: browserResult.errors, deactivated: browserResult.deactivated }, native: { delivered: nativeDelivered, errors: nativeErrors, deactivated: nativeDeactivated } },
        },
        '[web-push] push delivery complete',
      );

      return {
        webPushOutcome: {
          status: delivered > 0 ? 'success' : errors > 0 ? 'failed' : 'skipped',
          ...(delivered === 0 && errors > 0 ? { reason: 'provider_error' } : {}),
          delivered,
          errors,
          deactivated: browserResult.deactivated + nativeDeactivated,
          transports: { browser: { delivered: browserResult.delivered, errors: browserResult.errors, deactivated: browserResult.deactivated }, native: { delivered: nativeDelivered, errors: nativeErrors, deactivated: nativeDeactivated } },
          ...(browserResult.failureStatusCode !== undefined
            ? { providerStatusCode: browserResult.failureStatusCode }
            : {}),
          ...(browserResult.failureCode ? { providerErrorCode: browserResult.failureCode } : {}),
        },
      };
    },
  };
}
