import type { DeliveryAttemptResult, DeliveryJob, DeliverySendResult, OutgoingIntent } from '../../../kernel/contracts/index.js';

export type JobExecutorDeps = {
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  dispatchWebappPush?: (input: {
    phoneNormalized: string;
    slotStartIso: string;
    stableKey: string;
  }) => Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function resolveIntentForAttempt(job: DeliveryJob): OutgoingIntent | null {
  const payload = asRecord(job.payload);
  const baseIntent = asRecord(payload.intent);
  if (baseIntent.type !== 'message.send') return null;

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
    : targets[attemptIndex] ?? targets[0];

  const resolvedChannel = channel
    ?? (typeof target?.resource === 'string' ? target.resource : null);
  if (!resolvedChannel) return null;

  const recipient = target ? asRecord(target.address) : asRecord(asRecord(baseIntent.payload).recipient);
  return {
    type: 'message.send',
    meta: baseIntent.meta as OutgoingIntent['meta'],
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
export async function executeJob(job: DeliveryJob, deps: JobExecutorDeps): Promise<DeliveryAttemptResult> {
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
    if (
      deps.dispatchWebappPush &&
      pushNotify &&
      typeof pushNotify === 'object' &&
      typeof (pushNotify as { phoneNormalized?: unknown }).phoneNormalized === 'string' &&
      typeof (pushNotify as { slotStartIso?: unknown }).slotStartIso === 'string' &&
      typeof (pushNotify as { stableKey?: unknown }).stableKey === 'string'
    ) {
      await deps.dispatchWebappPush({
        phoneNormalized: (pushNotify as { phoneNormalized: string }).phoneNormalized,
        slotStartIso: (pushNotify as { slotStartIso: string }).slotStartIso,
        stableKey: (pushNotify as { stableKey: string }).stableKey,
      });
    }
    return { ok: true, final: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: error instanceof Error ? error.message : String(error),
      final: false,
    };
  }
}
