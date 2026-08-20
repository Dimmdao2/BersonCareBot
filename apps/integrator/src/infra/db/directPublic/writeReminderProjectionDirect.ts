import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot, runIntegratorSql } from '../runIntegratorSql.js';

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
  await runIntegratorSql(
    db,
    sql`INSERT INTO public.reminder_delivery_events (
      organization_id, integrator_delivery_log_id, integrator_occurrence_id, integrator_rule_id,
      integrator_user_id, channel, status, error_code, payload_json, created_at
    ) VALUES (
      ${input.organizationId}::uuid, ${input.integratorDeliveryLogId}, ${input.integratorOccurrenceId},
      ${input.integratorRuleId}, ${input.integratorUserId}::bigint, ${input.channel}, ${input.status},
      ${input.errorCode}, ${JSON.stringify(input.payloadJson)}::jsonb, ${input.createdAt}::timestamptz
    ) ON CONFLICT (integrator_delivery_log_id) DO NOTHING`,
  );
}

export async function upsertContentAccessGrantDirect(
  db: DbPort,
  input: ContentAccessGrantDirectInput,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`INSERT INTO public.content_access_grants_webapp (
      organization_id, integrator_grant_id, platform_user_id, integrator_user_id, content_id, purpose,
      token_hash, expires_at, revoked_at, meta_json, created_at
    ) VALUES (
      ${input.organizationId}::uuid, ${input.integratorGrantId}, ${input.platformUserId}::uuid,
      ${input.integratorUserId}::bigint, ${input.contentId}, ${input.purpose}, ${input.tokenHash},
      ${input.expiresAt}::timestamptz, ${input.revokedAt}::timestamptz,
      ${JSON.stringify(input.metaJson)}::jsonb, ${input.createdAt}::timestamptz
    ) ON CONFLICT (integrator_grant_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      platform_user_id = COALESCE(EXCLUDED.platform_user_id, content_access_grants_webapp.platform_user_id),
      integrator_user_id = EXCLUDED.integrator_user_id,
      content_id = EXCLUDED.content_id,
      purpose = EXCLUDED.purpose,
      token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at,
      revoked_at = EXCLUDED.revoked_at,
      meta_json = EXCLUDED.meta_json`,
  );
}
