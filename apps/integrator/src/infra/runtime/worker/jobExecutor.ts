import type {
  DeliveryAttemptResult,
  DeliveryJob,
  DeliverySendResult,
  OutgoingIntent,
} from '../../../kernel/contracts/index.js';
import {
  OUTBOUND_MESSAGE_POLICY_DENIED,
  isOutboundMessagePolicyDenied,
} from '../../adapters/outboundMessagePolicy.js';

export type JobExecutorDeps = {
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  dispatchWebappPush?: (input: {
    organizationId: string;
    phoneNormalized: string;
    slotStartIso: string;
    stableKey: string;
  }) => Promise<void>;
};

export function assertWebappPushNotifyAccepted(result: { ok: boolean; status: number }): void {
  if (!result.ok) throw new Error(`WEBAPP_PUSH_NOTIFY_FAILED:${result.status}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function resolveIntentForAttempt(job: DeliveryJob): OutgoingIntent | null {
  const payload = asRecord(job.payload);
  const baseIntent = asRecord(payload.intent);
  if (baseIntent.type !== 'message.send') return null;
  const baseMeta = asRecord(baseIntent.meta);
  if (
    typeof baseMeta.eventId !== 'string' ||
    typeof baseMeta.occurredAt !== 'string' ||
    typeof baseMeta.source !== 'string'
  )
    return null;

  const delivery = asRecord(asRecord(baseIntent.payload).delivery);
  const targets = Array.isArray(payload.targets)
    ? payload.targets.map((item) => asRecord(item))
    : [];
  const channels = Array.isArray(delivery.channels)
    ? delivery.channels.filter((item): item is string => typeof item === 'string')
    : [];

  const attemptIndex = Math.max(0, Math.trunc(job.attempts));
  const channel = channels[attemptIndex] ?? channels[channels.length - 1];
  const target = channel
    ? targets.find((item) => {
        const resource = item.resource;
        return typeof resource === 'string' && resource === channel;
      })
    : (targets[attemptIndex] ?? targets[0]);

  const resolvedChannel =
    channel ?? (typeof target?.resource === 'string' ? target.resource : null);
  if (!resolvedChannel) return null;

  const recipient = target
    ? asRecord(target.address)
    : asRecord(asRecord(baseIntent.payload).recipient);
  return {
    type: 'message.send',
    // A persisted legacy booking row cannot grant itself an auth capability. Trusted
    // auth routes construct markers in code; this replay spine never reconstructs them.
    meta: {
      eventId: baseMeta.eventId,
      occurredAt: baseMeta.occurredAt,
      source: baseMeta.source,
      // This adapter is the trusted server-side compatibility boundary for rows already
      // persisted before the unified queue cutover. Never copy capability markers from JSON.
      outboundMessageClass: 'routine_product',
      outboundCapability: 'essential_delivery',
    },
    payload: {
      ...asRecord(baseIntent.payload),
      recipient,
      delivery: {
        ...delivery,
        channels: [resolvedChannel],
        maxAttempts: 1,
      },
    },
  };
}

/** Executes one delivery attempt from pre-built job payload without business decision making. */
export async function executeJob(
  job: DeliveryJob,
  deps: JobExecutorDeps,
): Promise<DeliveryAttemptResult> {
  const payload = asRecord(job.payload);
  const intent = resolveIntentForAttempt(job);
  if (!intent) {
    return {
      ok: false,
      errorCode: 'INVALID_JOB_INTENT',
      final: true,
    };
  }

  try {
    await deps.dispatchOutgoing(intent);
    const pushNotify = payload.webappPushNotify;
    if (pushNotify !== undefined) {
      if (
        !pushNotify ||
        typeof pushNotify !== 'object' ||
        typeof (pushNotify as { organizationId?: unknown }).organizationId !== 'string' ||
        typeof (pushNotify as { phoneNormalized?: unknown }).phoneNormalized !== 'string' ||
        typeof (pushNotify as { slotStartIso?: unknown }).slotStartIso !== 'string' ||
        typeof (pushNotify as { stableKey?: unknown }).stableKey !== 'string'
      ) {
        throw new Error('INVALID_WEBAPP_PUSH_NOTIFY_PAYLOAD');
      }
      if (!deps.dispatchWebappPush) {
        throw new Error('WEBAPP_PUSH_DISPATCH_UNAVAILABLE');
      }
      await deps.dispatchWebappPush({
        organizationId: (pushNotify as { organizationId: string }).organizationId,
        phoneNormalized: (pushNotify as { phoneNormalized: string }).phoneNormalized,
        slotStartIso: (pushNotify as { slotStartIso: string }).slotStartIso,
        stableKey: (pushNotify as { stableKey: string }).stableKey,
      });
    }
    return { ok: true, final: true };
  } catch (error) {
    if (isOutboundMessagePolicyDenied(error)) {
      return { ok: false, errorCode: OUTBOUND_MESSAGE_POLICY_DENIED, final: true };
    }
    return {
      ok: false,
      errorCode: error instanceof Error ? error.message : String(error),
      final: false,
    };
  }
}
