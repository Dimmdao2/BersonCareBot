import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

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

/** Direct replacement for the reminder HTTP projection consumers. */
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
