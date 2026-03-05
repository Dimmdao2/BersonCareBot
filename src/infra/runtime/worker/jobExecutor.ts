import type { DeliveryAttemptResult, DeliveryJob, OutgoingIntent } from '../../../kernel/contracts/index.js';

export type JobExecutorDeps = {
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<void>;
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
  const channel = channels[attemptIndex] ?? channels[channels.length - 1] ?? 'smsc';
  const target = targets.find((item) => {
    const resource = item.resource;
    return typeof resource === 'string' && resource === channel;
  }) ?? targets[0];

  const recipient = target ? asRecord(target.address) : asRecord(asRecord(baseIntent.payload).recipient);
  return {
    type: 'message.send',
    meta: baseIntent.meta as OutgoingIntent['meta'],
    payload: {
      ...asRecord(baseIntent.payload),
      recipient,
      delivery: {
        ...delivery,
        channels: [channel],
        maxAttempts: 1,
      },
    },
  };
}

/** Executes one delivery attempt from pre-built job payload without business decision making. */
export async function executeJob(job: DeliveryJob, deps: JobExecutorDeps): Promise<DeliveryAttemptResult> {
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
    return { ok: true, final: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: error instanceof Error ? error.message : String(error),
      final: false,
    };
  }
}
