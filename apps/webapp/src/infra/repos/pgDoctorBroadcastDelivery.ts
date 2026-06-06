import { getPool } from "@/infra/db/client";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import type { BroadcastAuditEntry, DoctorBroadcastDeliveryCommitPort } from "@/modules/doctor-broadcasts/ports";
import { normalizeBroadcastChannels } from "@/modules/doctor-broadcasts/broadcastChannels";

function mapRow(row: Record<string, unknown>): BroadcastAuditEntry {
  const rawChannels = row.channels;
  const channels = normalizeBroadcastChannels(
    Array.isArray(rawChannels) ? rawChannels.map(String) : undefined,
  );
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    category: row.category as BroadcastAuditEntry["category"],
    audienceFilter: row.audience_filter as BroadcastAuditEntry["audienceFilter"],
    messageTitle: String(row.message_title),
    messageBody: typeof row.message_body === "string" ? row.message_body : "",
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

/** Wave 3 phase 13D — Class C TX; domain SQL via `runWebappPgText` on tx client. */
export function createPgDoctorBroadcastDeliveryCommitPort(): DoctorBroadcastDeliveryCommitPort {
  return {
    async commitAuditAndDeliveryQueue(input) {
      const auditId = input.auditId;
      const deliveryTotal = input.jobs.length;
      const pool = getPool();
      const client = await pool.connect();
      const tx = getWebappSqlFromPgClient(client);
      try {
        await client.query("BEGIN");
        const ins = await runWebappPgText<Record<string, unknown>>(
          `INSERT INTO broadcast_audit (
             id,
             actor_id,
             category,
             audience_filter,
             message_title,
             message_body,
             channels,
             preview_only,
             audience_size,
             delivery_jobs_total,
             attach_menu_after_send,
             sent_count,
             error_count,
             blocked_recipient_count
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id, actor_id, category, audience_filter, message_title, message_body, channels, executed_at, preview_only, audience_size, delivery_jobs_total, attach_menu_after_send, sent_count, error_count, blocked_recipient_count`,
          [
            auditId,
            input.audit.actorId,
            input.audit.category,
            input.audit.audienceFilter,
            input.audit.messageTitle,
            input.audit.messageBody,
            input.audit.channels,
            input.audit.previewOnly,
            input.audit.audienceSize,
            deliveryTotal,
            input.audit.attachMenuAfterSend,
            input.audit.sentCount,
            input.audit.errorCount,
            input.audit.blockedRecipientCount ?? 0,
          ],
          tx,
        );
        for (const job of input.jobs) {
          const insJob = await runWebappPgText<{ id: string }>(
            `INSERT INTO outgoing_delivery_queue (
               event_id,
               kind,
               channel,
               payload_json,
               status,
               attempt_count,
               max_attempts,
               next_retry_at
             ) VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, $5, now())
             ON CONFLICT (event_id) DO NOTHING
             RETURNING id`,
            [job.eventId, job.kind, job.channel, JSON.stringify(job.payloadJson), job.maxAttempts],
            tx,
          );
          if ((insJob.rowCount ?? 0) !== 1) {
            throw new Error("outgoing_delivery_queue_insert_conflict_or_skipped");
          }
        }
        const recipientIds = [...new Set(input.recipientUserIds.map((id) => id.trim()).filter(Boolean))];
        if (recipientIds.length > 0) {
          await runWebappPgText(
            `INSERT INTO broadcast_audit_recipients (audit_id, platform_user_id)
             SELECT $1::uuid, unnest($2::uuid[])`,
            [auditId, recipientIds],
            tx,
          );
        }
        await client.query("COMMIT");
        return mapRow(ins.rows[0] as Record<string, unknown>);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
