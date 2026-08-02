/**
 * Typed Drizzle implementation of the live broadcast audit port.
 */
import { desc } from 'drizzle-orm';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { BroadcastAuditEntry, BroadcastAuditPort } from '@/modules/doctor-broadcasts/ports';
import { broadcastAudit } from '../../../db/schema/schema';

function mapRow(row: typeof broadcastAudit.$inferSelect): BroadcastAuditEntry {
  return {
    id: row.id,
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

export function createPgBroadcastAuditPort(): BroadcastAuditPort {
  return {
    async append(entry): Promise<BroadcastAuditEntry> {
      const [row] = await getWebappSqlDb()
        .insert(broadcastAudit)
        .values({
          actorId: entry.actorId,
          category: entry.category,
          audienceFilter: entry.audienceFilter,
          messageTitle: entry.messageTitle,
          messageBody: entry.messageBody ?? '',
          channels: entry.channels,
          previewOnly: entry.previewOnly,
          audienceSize: entry.audienceSize,
          deliveryJobsTotal: entry.deliveryJobsTotal ?? 0,
          attachMenuAfterSend: entry.attachMenuAfterSend,
          sentCount: entry.sentCount,
          errorCount: entry.errorCount,
          blockedRecipientCount: entry.blockedRecipientCount ?? 0,
        })
        .returning();
      return mapRow(row);
    },
    async list(limit = 50): Promise<BroadcastAuditEntry[]> {
      const rows = await getWebappSqlDb()
        .select()
        .from(broadcastAudit)
        .orderBy(desc(broadcastAudit.executedAt))
        .limit(limit);
      return rows.map(mapRow);
    },
  };
}
