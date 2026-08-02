import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import type {
  BroadcastAuditEntry,
  DoctorBroadcastDeliveryCommitPort,
} from '@/modules/doctor-broadcasts/ports';
import { normalizeBroadcastChannels } from '@/modules/doctor-broadcasts/broadcastChannels';
import { broadcastAudit } from '../../../db/schema/schema';
import { broadcastAuditRecipients } from '../../../db/schema/broadcastAuditRecipients';
import { outgoingDeliveryQueue } from '../../../db/schema/outgoingDeliveryQueue';

function mapRow(row: Record<string, unknown>): BroadcastAuditEntry {
  const rawChannels = row.channels;
  const channels = normalizeBroadcastChannels(
    Array.isArray(rawChannels) ? rawChannels.map(String) : undefined,
  );
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    category: row.category as BroadcastAuditEntry['category'],
    audienceFilter: row.audience_filter as BroadcastAuditEntry['audienceFilter'],
    messageTitle: String(row.message_title),
    messageBody: typeof row.message_body === 'string' ? row.message_body : '',
    channels,
    executedAt: new Date(String(row.executed_at)).toISOString(),
    previewOnly: Boolean(row.preview_only),
    audienceSize: Number(row.audience_size),
    deliveryJobsTotal: Number(row.delivery_jobs_total ?? 0),
    attachMenuAfterSend: Boolean(row.attach_menu_after_send ?? false),
    sentCount: Number(row.sent_count),
    errorCount: Number(row.error_count),
    blockedRecipientCount: Number(row.blocked_recipient_count ?? 0),
  };
}

/** Audit, jobs and recipients share one Drizzle binding on the transaction PoolClient. */
export function createPgDoctorBroadcastDeliveryCommitPort(): DoctorBroadcastDeliveryCommitPort {
  return {
    async commitAuditAndDeliveryQueue(input) {
      const auditId = input.auditId;
      const deliveryTotal = input.jobs.length;
      const pool = getPool();
      return withPoolTransaction(pool, async (client) => {
        const tx = getWebappSqlFromPgClient(client);
        const [audit] = await tx
          .insert(broadcastAudit)
          .values({
            id: auditId,
            actorId: input.audit.actorId,
            category: input.audit.category,
            audienceFilter: input.audit.audienceFilter,
            messageTitle: input.audit.messageTitle,
            messageBody: input.audit.messageBody,
            channels: input.audit.channels,
            previewOnly: input.audit.previewOnly,
            audienceSize: input.audit.audienceSize,
            deliveryJobsTotal: deliveryTotal,
            attachMenuAfterSend: input.audit.attachMenuAfterSend,
            sentCount: input.audit.sentCount,
            errorCount: input.audit.errorCount,
            blockedRecipientCount: input.audit.blockedRecipientCount ?? 0,
          })
          .returning();
        for (const job of input.jobs) {
          const insertedJobs = await tx
            .insert(outgoingDeliveryQueue)
            .values({
              eventId: job.eventId,
              kind: job.kind,
              channel: job.channel,
              payloadJson: job.payloadJson,
              status: 'pending',
              attemptCount: 0,
              maxAttempts: job.maxAttempts,
              nextRetryAt: sql`now()`,
            })
            .onConflictDoNothing({ target: outgoingDeliveryQueue.eventId })
            .returning({ id: outgoingDeliveryQueue.id });
          if (insertedJobs.length !== 1) {
            throw new Error('outgoing_delivery_queue_insert_conflict_or_skipped');
          }
        }
        const recipientIds = [
          ...new Set(input.recipientUserIds.map((id) => id.trim()).filter(Boolean)),
        ];
        if (recipientIds.length > 0) {
          await tx.insert(broadcastAuditRecipients).values(
            recipientIds.map((platformUserId) => ({ auditId, platformUserId })),
          );
        }
        return mapRow(audit as Record<string, unknown>);
      });
    },
  };
}
