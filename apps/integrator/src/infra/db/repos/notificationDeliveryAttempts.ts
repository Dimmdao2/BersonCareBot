import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';
import { runWithOptionalOrganizationPrincipal } from '../../principal/organizationPrincipal.js';

/**
 * D17. `app_tenant_service` is the only role of the integrator login the declaration grants INSERT on
 * `public.notification_delivery_attempts`, so this write has always travelled under the organization
 * principal — and only when the caller knew the organization. The named root keeps exactly that:
 * without an organization there is no organization principal, so in port-context mode no
 * `tenant_service` capability matches and the call fails before the database; if it does reach the
 * database, the root refuses on `app.current_org_id()`. Either way the best-effort catch below turns
 * it into the same warning a missing grant produced today, and delivery is not cancelled. The root
 * body repeats `rev10_tenant_insert_120` in SQL.
 *
 * It is deliberately NOT `app.record_operator_delivery_attempt`, the other root over this table:
 * that one is the queue-derived operator journal and validates a closed set of statuses and reasons
 * (`failed` only with `provider_rejected`), which this relay path does not satisfy.
 */
const RECORD_NOTIFICATION_DELIVERY_ATTEMPT_ROOT =
  'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)';

export type IntegratorNotificationDeliveryChannel = 'telegram' | 'max' | 'web_push' | 'email';

const MESSENGER_CHANNELS: IntegratorNotificationDeliveryChannel[] = ['telegram', 'max'];

function isMessengerChannel(
  channel: string,
): channel is Extract<IntegratorNotificationDeliveryChannel, 'telegram' | 'max'> {
  return (MESSENGER_CHANNELS as readonly string[]).includes(channel);
}

export type IntegratorRecordNotificationDeliveryAttemptInput = {
  integratorUserId?: string;
  userId?: string;
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
  organizationId?: string | null;
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
    const organizationId = input.organizationId ?? null;
    const userId = input.userId ?? null;
    const integratorUserId = input.integratorUserId ?? null;
    const topicCode = input.topicCode ?? null;
    const intentType = input.intentType ?? null;
    const reason = input.reason ?? null;
    const providerStatusCode = input.providerStatusCode ?? null;
    const eventId = input.eventId ?? null;
    const occurrenceId = parseOccurrenceUuid(input.occurrenceId);
    const recipientRef = input.recipientRef ?? null;
    const errorMessage = input.errorMessage ?? null;
    await runWithOptionalOrganizationPrincipal(organizationId, () =>
      runIntegratorNamedRoot(
        db,
        RECORD_NOTIFICATION_DELIVERY_ATTEMPT_ROOT,
        [
          organizationId,
          userId,
          integratorUserId,
          topicCode,
          intentType,
          input.channel,
          input.status,
          reason,
          providerStatusCode,
          eventId,
          occurrenceId,
          recipientRef,
          errorMessage,
          metadataJson,
        ],
        sql`SELECT app.integrator_record_notification_delivery_attempt(
          ${organizationId}::uuid,
          ${userId}::text,
          ${integratorUserId}::text,
          ${topicCode}::text,
          ${intentType}::text,
          ${input.channel}::text,
          ${input.status}::text,
          ${reason}::text,
          ${providerStatusCode}::integer,
          ${eventId}::text,
          ${occurrenceId}::text,
          ${recipientRef}::text,
          ${errorMessage}::text,
          ${metadataJson}::text
        )`,
      ),
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
    organizationId?: string | null;
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
      organizationId: input.organizationId ?? null,
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
    organizationId?: string | null;
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
      organizationId: input.organizationId ?? null,
    });
  }
}
