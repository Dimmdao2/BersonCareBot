import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import type {
  BroadcastAuditEntry,
  DoctorBroadcastDeliveryCommitPort,
} from '@/modules/doctor-broadcasts/ports';
import { broadcastAudit } from '../../../db/schema/schema';
import { broadcastAuditRecipients } from '../../../db/schema/broadcastAuditRecipients';
import { outgoingDeliveryQueue } from '../../../db/schema/outgoingDeliveryQueue';

function mapRow(row: typeof broadcastAudit.$inferSelect): BroadcastAuditEntry {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorId: row.actorId,
    category: row.category as BroadcastAuditEntry['category'],
    audienceFilter: row.audienceFilter as BroadcastAuditEntry['audienceFilter'],
    messageTitle: row.messageTitle,
    messageBody: row.messageBody,
    channels: row.channels as BroadcastAuditEntry['channels'],
    executedAt: new Date(row.executedAt).toISOString(),
    previewOnly: row.previewOnly,
    audienceSize: row.audienceSize,
    deliveryJobsTotal: row.deliveryJobsTotal,
    attachMenuAfterSend: row.attachMenuAfterSend,
    sentCount: row.sentCount,
    errorCount: row.errorCount,
    blockedRecipientCount: row.blockedRecipientCount,
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
            organizationId: input.audit.organizationId,
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
              organizationId: input.audit.organizationId,
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
            recipientIds.map((platformUserId) => ({
              organizationId: input.audit.organizationId,
              auditId,
              platformUserId,
            })),
          );
        }
        return mapRow(audit);
      });
    },
  };
}
