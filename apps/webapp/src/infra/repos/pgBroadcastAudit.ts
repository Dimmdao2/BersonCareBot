/**
 * Typed Drizzle implementation of the live broadcast audit port.
 */
import { desc } from 'drizzle-orm';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { BroadcastAuditEntry, BroadcastAuditPort } from '@/modules/doctor-broadcasts/ports';
import { normalizeBroadcastChannels } from '@/modules/doctor-broadcasts/broadcastChannels';
import { broadcastAudit } from '../../../db/schema/schema';

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
      return mapRow(row as Record<string, unknown>);
    },
    async list(limit = 50): Promise<BroadcastAuditEntry[]> {
      const rows = await getWebappSqlDb()
        .select()
        .from(broadcastAudit)
        .orderBy(desc(broadcastAudit.executedAt))
        .limit(limit);
      return rows.map((row) => mapRow(row as Record<string, unknown>));
    },
  };
}
