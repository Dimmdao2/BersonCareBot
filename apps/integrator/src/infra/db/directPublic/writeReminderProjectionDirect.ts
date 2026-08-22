import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17. The two remaining relational writers of this file are named roots now.
 *
 * Both land under `app_operational_delivery_worker`, not under the organization principal, because
 * that is the only role of the integrator login the declaration grants these two tables to — and it
 * grants them ONLY for a claimed durable retry (`rev10_delivery_replay_worker_170` /
 * `rev10_delivery_replay_worker_84`). The foreground attempt from the delivery worker runs inside an
 * organization principal, finds no `service`-class capability for the root, throws, and its caller
 * queues the durable retry exactly as it does today; `directPublicWriteRetryWorker` then reaches the
 * root under the delivery capability and the row lands. Each root body repeats that claimed-retry
 * wall in SQL, because a SECURITY DEFINER body does not see the policy.
 */
const APPEND_REMINDER_DELIVERY_EVENT_ROOT =
  'app.integrator_append_reminder_delivery_event(uuid,text,text,text,bigint,text,text,text,text,timestamp with time zone)';
const UPSERT_CONTENT_ACCESS_GRANT_ROOT =
  'app.integrator_upsert_content_access_grant(uuid,text,text,bigint,text,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)';

export type ReminderOccurrenceFinalizedDirectInput = {
  integratorOccurrenceId: string;
  integratorRuleId: string;
  integratorUserId: string;
  platformUserId: string;
  organizationId: string;
  category: string;
  status: 'sent' | 'failed';
  deliveryChannel: string | null;
  errorCode: string | null;
  occurredAt: string;
};

export type ReminderDeliveryLoggedDirectInput = {
  organizationId: string;
  integratorDeliveryLogId: string;
  integratorOccurrenceId: string;
  integratorRuleId: string;
  integratorUserId: string;
  channel: string;
  status: 'success' | 'failed';
  errorCode: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type ContentAccessGrantDirectInput = {
  organizationId: string;
  integratorGrantId: string;
  integratorUserId: string;
  platformUserId: string | null;
  contentId: string;
  purpose: string;
  tokenHash: string | null;
  expiresAt: string;
  revokedAt: string | null;
  metaJson: Record<string, unknown>;
  createdAt: string;
};

/** Direct replacement for the three reminder/content HTTP projection consumers. */
export async function recordReminderOccurrenceFinalizedDirect(
  db: DbPort,
  input: ReminderOccurrenceFinalizedDirectInput,
): Promise<void> {
  await runIntegratorNamedRoot(
    db,
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)',
    [
      input.integratorOccurrenceId,
      input.integratorRuleId,
      input.integratorUserId,
      input.platformUserId,
      input.organizationId,
      input.category,
      input.status,
      input.deliveryChannel,
      input.errorCode,
      input.occurredAt,
    ],
    sql`SELECT app.record_reminder_occurrence_finalized_projection(
      ${input.integratorOccurrenceId}::text, ${input.integratorRuleId}::text,
      ${input.integratorUserId}::bigint, ${input.platformUserId}::uuid,
      ${input.organizationId}::uuid, ${input.category}::text, ${input.status}::text,
      ${input.deliveryChannel}::text, ${input.errorCode}::text, ${input.occurredAt}::timestamptz
    )`,
  );
}

export async function appendReminderDeliveryEventDirect(
  db: DbPort,
  input: ReminderDeliveryLoggedDirectInput,
): Promise<void> {
  const payloadJson = JSON.stringify(input.payloadJson);
  await runIntegratorNamedRoot(
    db,
    APPEND_REMINDER_DELIVERY_EVENT_ROOT,
    [
      input.organizationId,
      input.integratorDeliveryLogId,
      input.integratorOccurrenceId,
      input.integratorRuleId,
      input.integratorUserId,
      input.channel,
      input.status,
      input.errorCode,
      payloadJson,
      input.createdAt,
    ],
    sql`SELECT app.integrator_append_reminder_delivery_event(
      ${input.organizationId}::uuid, ${input.integratorDeliveryLogId}::text,
      ${input.integratorOccurrenceId}::text, ${input.integratorRuleId}::text,
      ${input.integratorUserId}::bigint, ${input.channel}::text, ${input.status}::text,
      ${input.errorCode}::text, ${payloadJson}::text, ${input.createdAt}::timestamptz
    )`,
  );
}

export async function upsertContentAccessGrantDirect(
  db: DbPort,
  input: ContentAccessGrantDirectInput,
): Promise<void> {
  const metaJson = JSON.stringify(input.metaJson);
  await runIntegratorNamedRoot(
    db,
    UPSERT_CONTENT_ACCESS_GRANT_ROOT,
    [
      input.organizationId,
      input.integratorGrantId,
      input.platformUserId,
      input.integratorUserId,
      input.contentId,
      input.purpose,
      input.tokenHash,
      input.expiresAt,
      input.revokedAt,
      metaJson,
      input.createdAt,
    ],
    sql`SELECT app.integrator_upsert_content_access_grant(
      ${input.organizationId}::uuid, ${input.integratorGrantId}::text,
      ${input.platformUserId}::text, ${input.integratorUserId}::bigint,
      ${input.contentId}::text, ${input.purpose}::text, ${input.tokenHash}::text,
      ${input.expiresAt}::timestamptz, ${input.revokedAt}::timestamptz,
      ${metaJson}::text, ${input.createdAt}::timestamptz
    )`,
  );
}
