/**
 * Web-push provider call (S14 — the moved S6 sink).
 *
 * This is the ONLY place in the integrator that calls `webpush.sendNotification`.
 * Mirrors the logic in webapp's `sendWebPushToSubscriptions.ts` (S6) but executed
 * here, inside the integrator's DeliveryAdapter pipeline, so it is covered by the
 * pre-fork redirect chokepoint (G1) and never leaks to real users in dev.
 *
 * NOT called directly by application code — only by `WebPushDeliveryAdapter.send()`.
 */
import webpush from 'web-push';
import type { WebPushSubscriptionPayload, VapidCredentials } from '../../kernel/contracts/index.js';

/** Mirrors webapp's `WebPushClientPayload` (superset — no data loss per PLAN S12). */
export type WebPushSendPayload = {
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

export type WebPushSendAttemptResult = {
  status: 'success' | 'failed';
  endpointHash: string;
  providerStatusCode?: number;
  reason?: 'provider_404' | 'provider_410' | 'provider_error' | 'send_error';
  errorMessage?: string;
};

export type WebPushSendOptions = {
  subscriptions: WebPushSubscriptionPayload[];
  vapid: VapidCredentials;
  payload: WebPushSendPayload;
  onSubscriptionDead: (endpoint: string) => Promise<void>;
  onAttempt?: (result: WebPushSendAttemptResult) => void | Promise<void>;
};

export type WebPushSendResult = {
  delivered: number;
  errors: number;
  deactivated: number;
};

/**
 * Send a web-push notification to all subscriptions for a user.
 *
 * Handles 410/404 dead-subscription cleanup via `onSubscriptionDead`.
 * `onAttempt` fires for every subscription attempt (analytics/delivery log).
 *
 * This function performs real network calls and MUST only be invoked from within
 * `dispatchOutgoing` (the pre-fork redirect ensures it cannot be reached in dev
 * when redirect is active — the intent is collapsed to telegram before the adapter
 * is selected). The G2 guard in `sendWebPushToSubscriptions.ts` provides defence
 * for the remaining webapp-side legs that haven't migrated yet (S14b–S14g).
 */
export async function sendWebPushViaProvider(opts: WebPushSendOptions): Promise<WebPushSendResult> {
  const { subscriptions, vapid, payload, onSubscriptionDead, onAttempt } = opts;

  if (subscriptions.length === 0) {
    return { delivered: 0, errors: 0, deactivated: 0 };
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
    // Derive a stable hash of the endpoint for analytics (matches webapp's hashWebPushEndpoint).
    // Use a simple truncation here — the hash is for analytics only, not security.
    const endpointHash = sub.endpoint.slice(-32);

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
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
        },
      );
      delivered += 1;
      const successStatusCode = (result as { statusCode?: number })?.statusCode;
      await onAttempt?.({
        status: 'success',
        endpointHash,
        ...(typeof successStatusCode === 'number' ? { providerStatusCode: successStatusCode } : {}),
      });
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      const message = e instanceof Error ? e.message : String(e);

      if (statusCode === 410 || statusCode === 404) {
        await onSubscriptionDead(sub.endpoint);
        deactivated += 1;
        const reason = statusCode === 410 ? 'provider_410' : 'provider_404';
        await onAttempt?.({
          status: 'failed',
          endpointHash,
          providerStatusCode: statusCode,
          reason,
          errorMessage: message,
        });
      } else {
        await onAttempt?.({
          status: 'failed',
          endpointHash,
          ...(typeof statusCode === 'number' ? { providerStatusCode: statusCode } : {}),
          reason: 'provider_error',
          errorMessage: message,
        });
      }
      errors += 1;
    }
  }

  return { delivered, errors, deactivated };
}
