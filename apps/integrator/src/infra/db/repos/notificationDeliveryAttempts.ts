import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export type IntegratorNotificationDeliveryChannel = 'telegram' | 'max';

const MESSENGER_CHANNELS: IntegratorNotificationDeliveryChannel[] = ['telegram', 'max'];

function isMessengerChannel(channel: string): channel is IntegratorNotificationDeliveryChannel {
  return (MESSENGER_CHANNELS as readonly string[]).includes(channel);
}

export type IntegratorRecordNotificationDeliveryAttemptInput = {
  integratorUserId?: string;
  topicCode?: string;
  intentType?: string;
  channel: IntegratorNotificationDeliveryChannel;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
  providerStatusCode?: number;
  eventId?: string;
  occurrenceId?: string;
  recipientRef?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

function parseOccurrenceUuid(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const t = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return t;
  }
  return null;
}

/** Best-effort insert into webapp `notification_delivery_attempts` (shared public schema). */
export async function recordNotificationDeliveryAttemptBestEffort(
  db: DbPort,
  input: IntegratorRecordNotificationDeliveryAttemptInput,
): Promise<void> {
  try {
    const metadataJson = JSON.stringify(input.metadata ?? {});
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.notification_delivery_attempts (
        integrator_user_id, topic_code, intent_type, channel, status, reason,
        provider_status_code, event_id, occurrence_id, recipient_ref, error_message, metadata
      ) VALUES (
        ${input.integratorUserId ?? null},
        ${input.topicCode ?? null},
        ${input.intentType ?? null},
        ${input.channel},
        ${input.status},
        ${input.reason ?? null},
        ${input.providerStatusCode ?? null},
        ${input.eventId ?? null},
        ${parseOccurrenceUuid(input.occurrenceId)}::uuid,
        ${input.recipientRef ?? null},
        ${input.errorMessage ?? null},
        ${metadataJson}::jsonb
      )`,
    );
  } catch (err) {
    logger.warn(
      { err, channel: input.channel, status: input.status, eventId: input.eventId },
      'notification_delivery_attempt_record_failed',
    );
  }
}

/** Persist telegram/max skips from channel resolution (dispatchDue, before queue enqueue). */
export async function recordMessengerChannelSkipsBestEffort(
  db: DbPort,
  input: {
    integratorUserId: string;
    occurrenceId: string;
    topicCode: string;
    intentType?: string;
    skippedChannels: Array<{ channel: string; reason: string }>;
  },
): Promise<void> {
  for (const s of input.skippedChannels) {
    if (!isMessengerChannel(s.channel)) continue;
    await recordNotificationDeliveryAttemptBestEffort(db, {
      integratorUserId: input.integratorUserId,
      topicCode: input.topicCode,
      occurrenceId: input.occurrenceId,
      intentType: input.intentType ?? 'reminder_dispatch',
      channel: s.channel,
      status: 'skipped',
      reason: s.reason,
    });
  }
}

/** Messenger channels not enqueued (no identity / binding); skips duplicates from resolution. */
export async function recordMessengerNotEnqueuedSkipsBestEffort(
  db: DbPort,
  input: {
    integratorUserId: string;
    occurrenceId: string;
    topicCode: string;
    intentType?: string;
    sendChannels: Array<{ channel: 'telegram' | 'max' }>;
    alreadySkippedChannels: ReadonlySet<string>;
  },
): Promise<void> {
  for (const ch of MESSENGER_CHANNELS) {
    if (input.alreadySkippedChannels.has(ch)) continue;
    if (input.sendChannels.some((s) => s.channel === ch)) continue;
    await recordNotificationDeliveryAttemptBestEffort(db, {
      integratorUserId: input.integratorUserId,
      topicCode: input.topicCode,
      occurrenceId: input.occurrenceId,
      intentType: input.intentType ?? 'reminder_dispatch',
      channel: ch,
      status: 'skipped',
      reason: 'missing_binding',
    });
  }
}
