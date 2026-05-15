import { getPool } from "@/infra/db/client";
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
    sentCount: Number(row.sent_count),
    errorCount: Number(row.error_count),
  };
}

export function createPgDoctorBroadcastDeliveryCommitPort(): DoctorBroadcastDeliveryCommitPort {
  return {
    async commitAuditAndDeliveryQueue(input) {
      const auditId = input.auditId;
      const deliveryTotal = input.jobs.length;
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
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
             sent_count,
             error_count
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id, actor_id, category, audience_filter, message_title, message_body, channels, executed_at, preview_only, audience_size, delivery_jobs_total, sent_count, error_count`,
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
            input.audit.sentCount,
            input.audit.errorCount,
          ],
        );
        for (const job of input.jobs) {
          const insJob = await client.query(
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
          );
          if (insJob.rowCount !== 1) {
            throw new Error("outgoing_delivery_queue_insert_conflict_or_skipped");
          }
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
