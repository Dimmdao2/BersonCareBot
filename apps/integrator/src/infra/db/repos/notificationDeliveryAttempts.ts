import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';
import { runWithOptionalOrganizationPrincipal } from '../../principal/organizationPrincipal.js';

/**
 * The canonical queue owns all outcomes. This root records only the exceptional fact that a provider
 * was actually called and failed; preparation failures, success, and local skips stay on that queue.
 */
const RECORD_NOTIFICATION_DELIVERY_ATTEMPT_ROOT =
  'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)';

export type IntegratorNotificationDeliveryChannel = 'telegram' | 'max' | 'web_push' | 'email';

export type IntegratorRecordNotificationDeliveryAttemptInput = {
  integratorUserId?: string;
  userId?: string;
  topicCode?: string;
  intentType?: string;
  channel: IntegratorNotificationDeliveryChannel;
  status: 'failed';
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
