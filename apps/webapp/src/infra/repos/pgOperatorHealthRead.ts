import { and, asc, count, desc, eq, inArray, isNull, lte, max, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { operatorIncidents, operatorJobStatus } from "../../../db/schema/operatorHealth";
import { outgoingDeliveryQueue } from "../../../db/schema/outgoingDeliveryQueue";
import type {
  OperatorBackupJobStatusRow,
  OperatorHealthReadPort,
  OperatorIncidentOpenRow,
  OperatorJobStatusTickRow,
  OutgoingDeliveryQueueHealthSnapshot,
} from "@/modules/operator-health/ports";

export const pgOperatorHealthReadPort: OperatorHealthReadPort = {
  async listOpenIncidents(limit: number): Promise<OperatorIncidentOpenRow[]> {
    const db = getDrizzle();
    const rows = await db
      .select({
        id: operatorIncidents.id,
        dedupKey: operatorIncidents.dedupKey,
        direction: operatorIncidents.direction,
        integration: operatorIncidents.integration,
        errorClass: operatorIncidents.errorClass,
        errorDetail: operatorIncidents.errorDetail,
        openedAt: operatorIncidents.openedAt,
        lastSeenAt: operatorIncidents.lastSeenAt,
        occurrenceCount: operatorIncidents.occurrenceCount,
      })
      .from(operatorIncidents)
      .where(isNull(operatorIncidents.resolvedAt))
      .orderBy(desc(operatorIncidents.lastSeenAt))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((r) => ({
      id: r.id,
      dedupKey: r.dedupKey,
      direction: r.direction,
      integration: r.integration,
      errorClass: r.errorClass,
      errorDetail: r.errorDetail ?? null,
      openedAt: r.openedAt,
      lastSeenAt: r.lastSeenAt,
      occurrenceCount: r.occurrenceCount,
    }));
  },

  async listBackupJobStatus(): Promise<OperatorBackupJobStatusRow[]> {
    const db = getDrizzle();
    const rows = await db
      .select({
        jobKey: operatorJobStatus.jobKey,
        jobFamily: operatorJobStatus.jobFamily,
        lastStatus: operatorJobStatus.lastStatus,
        lastStartedAt: operatorJobStatus.lastStartedAt,
        lastFinishedAt: operatorJobStatus.lastFinishedAt,
        lastSuccessAt: operatorJobStatus.lastSuccessAt,
        lastFailureAt: operatorJobStatus.lastFailureAt,
        lastDurationMs: operatorJobStatus.lastDurationMs,
        lastError: operatorJobStatus.lastError,
      })
      .from(operatorJobStatus)
      .where(eq(operatorJobStatus.jobFamily, "backup"))
      .orderBy(operatorJobStatus.jobKey);

    return rows.map((r) => ({
      jobKey: r.jobKey,
      jobFamily: r.jobFamily,
      lastStatus: r.lastStatus,
      lastStartedAt: r.lastStartedAt ?? null,
      lastFinishedAt: r.lastFinishedAt ?? null,
      lastSuccessAt: r.lastSuccessAt ?? null,
      lastFailureAt: r.lastFailureAt ?? null,
      lastDurationMs: r.lastDurationMs ?? null,
      lastError: r.lastError ?? null,
    }));
  },

  async getOperatorJobStatus(jobFamily: string, jobKey: string): Promise<OperatorJobStatusTickRow | null> {
    const db = getDrizzle();
    const rows = await db
      .select({
        jobKey: operatorJobStatus.jobKey,
        jobFamily: operatorJobStatus.jobFamily,
        lastStatus: operatorJobStatus.lastStatus,
        lastStartedAt: operatorJobStatus.lastStartedAt,
        lastFinishedAt: operatorJobStatus.lastFinishedAt,
        lastSuccessAt: operatorJobStatus.lastSuccessAt,
        lastFailureAt: operatorJobStatus.lastFailureAt,
        lastDurationMs: operatorJobStatus.lastDurationMs,
        lastError: operatorJobStatus.lastError,
        metaJson: operatorJobStatus.metaJson,
      })
      .from(operatorJobStatus)
      .where(and(eq(operatorJobStatus.jobFamily, jobFamily), eq(operatorJobStatus.jobKey, jobKey)))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const meta = r.metaJson;
    const metaJson =
      meta !== null && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
    return {
      jobKey: r.jobKey,
      jobFamily: r.jobFamily,
      lastStatus: r.lastStatus,
      lastStartedAt: r.lastStartedAt ?? null,
      lastFinishedAt: r.lastFinishedAt ?? null,
      lastSuccessAt: r.lastSuccessAt ?? null,
      lastFailureAt: r.lastFailureAt ?? null,
      lastDurationMs: r.lastDurationMs ?? null,
      lastError: r.lastError ?? null,
      metaJson,
    };
  },

  async getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot> {
    const db = getDrizzle();
    const dueWh = and(
      inArray(outgoingDeliveryQueue.status, ["pending", "failed_retryable"]),
      lte(outgoingDeliveryQueue.nextRetryAt, sql`now()`),
    );
    const [
      dueRows,
      deadRows,
      oldestRows,
      channelRows,
      processingRows,
      activityRows,
      sentRows,
    ] = await Promise.all([
      db.select({ c: count() }).from(outgoingDeliveryQueue).where(dueWh),
      db.select({ c: count() }).from(outgoingDeliveryQueue).where(eq(outgoingDeliveryQueue.status, "dead")),
      db
        .select({ createdAt: outgoingDeliveryQueue.createdAt })
        .from(outgoingDeliveryQueue)
        .where(dueWh)
        .orderBy(asc(outgoingDeliveryQueue.createdAt))
        .limit(1),
      db
        .select({ channel: outgoingDeliveryQueue.channel, n: count() })
        .from(outgoingDeliveryQueue)
        .where(dueWh)
        .groupBy(outgoingDeliveryQueue.channel),
      db
        .select({ c: count() })
        .from(outgoingDeliveryQueue)
        .where(eq(outgoingDeliveryQueue.status, "processing")),
      db.select({ mx: max(outgoingDeliveryQueue.updatedAt) }).from(outgoingDeliveryQueue),
      db.select({ mx: max(outgoingDeliveryQueue.sentAt) }).from(outgoingDeliveryQueue),
    ]);
    const dueRow = dueRows[0];
    const deadRow = deadRows[0];
    const oldestAt = oldestRows[0]?.createdAt;
    let oldestDueAgeSeconds: number | null = null;
    if (oldestAt) {
      const t = new Date(oldestAt).getTime();
      if (!Number.isNaN(t)) {
        oldestDueAgeSeconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
      }
    }
    const dueByChannel: Record<string, number> = {};
    for (const r of channelRows) {
      dueByChannel[r.channel] = Number(r.n ?? 0);
    }
    return {
      dueBacklog: Number(dueRow?.c ?? 0),
      deadTotal: Number(deadRow?.c ?? 0),
      oldestDueAgeSeconds,
      dueByChannel,
      processingCount: Number(processingRows[0]?.c ?? 0),
      lastSentAt: sentRows[0]?.mx ?? null,
      lastQueueActivityAt: activityRows[0]?.mx ?? null,
    };
  },
};
