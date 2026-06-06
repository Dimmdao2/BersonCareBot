import { and, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { broadcastAudit, integratorPushOutbox, platformUsers, projectionOutbox } from "../../../db/schema/schema";
import { operatorHealthFailureArchive } from "../../../db/schema/operatorHealthFailureArchive";
import { outgoingDeliveryQueue } from "../../../db/schema/outgoingDeliveryQueue";
import { DOCTOR_BROADCAST_QUEUE_KIND } from "@/modules/doctor-broadcasts/deliveryQueueKind";
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
  INTEGRATOR_OUTBOX_ARCHIVE_SOURCE_KIND,
  OUTGOING_ARCHIVE_SOURCE_KIND,
  OUTGOING_REMINDER_ARCHIVE_SOURCE_KIND,
  OUTGOING_REMINDER_QUEUE_KIND,
  PROJECTION_ARCHIVE_SOURCE_KIND,
} from "@/modules/operator-health/healthFailureArchiveConstants";
import type {
  HealthFailureArchiveClearBatchResult,
  HealthFailureArchiveListResult,
  HealthFailureArchivePort,
  HealthFailureArchiveRow,
} from "@/modules/operator-health/healthFailureArchivePort";
import type { HealthFailureArchiveProbe } from "@/modules/operator-health/healthFailureArchiveConstants";
import {
  humanizeIntegratorPushOutboxLastError,
  humanizeOutgoingDeliveryLastError,
  maskPhoneForHealthArchive,
} from "@/modules/operator-health/humanizeOutgoingDeliveryLastError";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function truncateError(s: string | null | undefined, max = 512): string | null {
  if (s == null || s.length === 0) return null;
  const t = String(s);
  return t.length <= max ? t : t.slice(0, max);
}

function parsePayload(p: unknown): Record<string, unknown> {
  if (p !== null && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  return {};
}

function shortTitle(title: string, max = 100): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function recipientShortName(row: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const dn = row.displayName?.trim();
  if (dn) return shortTitle(dn, 80);
  const parts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean);
  if (parts.length) return shortTitle(parts.join(" "), 80);
  return "—";
}

export type CursorPayload = { a: string; i: string };

export function encodeArchiveCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeArchiveCursor(raw: string | null | undefined): CursorPayload | null {
  if (raw == null || typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
    const o = json as Record<string, unknown>;
    const a = typeof o.a === "string" ? o.a : null;
    const i = typeof o.i === "string" ? o.i : null;
    if (!a || !i || !UUID_RE.test(i)) return null;
    return { a, i };
  } catch {
    return null;
  }
}

function actorToDoctorUuid(actorId: string): string | null {
  return UUID_RE.test(actorId) ? actorId : null;
}

export const pgHealthFailureArchivePort: HealthFailureArchivePort = {
  async archiveOutgoingDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    const db = getDrizzle();
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outgoingDeliveryQueue)
        .where(
          and(
            eq(outgoingDeliveryQueue.status, "dead"),
            or(
              isNull(outgoingDeliveryQueue.failureClass),
              ne(outgoingDeliveryQueue.failureClass, "recipient_blocked_bot"),
            ),
          ),
        )
        .limit(Math.min(500, Math.max(1, input.limit)));

      if (rows.length === 0) {
        return { inserted: 0, deleted: 0 };
      }

      const broadcastRows = rows.filter((r) => r.kind === DOCTOR_BROADCAST_QUEUE_KIND);
      const auditIds = [
        ...new Set(
          broadcastRows
            .map((r) => {
              const p = parsePayload(r.payloadJson);
              return typeof p.broadcastAuditId === "string" ? p.broadcastAuditId : null;
            })
            .filter((x): x is string => x != null && UUID_RE.test(x)),
        ),
      ];
      const clientIds = [
        ...new Set(
          broadcastRows
            .map((r) => {
              const p = parsePayload(r.payloadJson);
              return typeof p.clientUserId === "string" ? p.clientUserId : null;
            })
            .filter((x): x is string => x != null && UUID_RE.test(x)),
        ),
      ];

      const audits =
        auditIds.length > 0
          ? await tx.select().from(broadcastAudit).where(inArray(broadcastAudit.id, auditIds))
          : [];
      const auditMap = new Map(audits.map((a) => [a.id, a]));

      const users =
        clientIds.length > 0
          ? await tx.select().from(platformUsers).where(inArray(platformUsers.id, clientIds))
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const insertValues = rows.map((row) => {
        const payload = parsePayload(row.payloadJson);
        const { reason_code, reason_ru } = humanizeOutgoingDeliveryLastError(row.lastError);
        const summary: Record<string, unknown> = {
          reason_code,
          reason_ru,
          channel: row.channel,
          queue_kind: row.kind,
        };

        let doctorUserId: string | null = null;
        if (row.kind === DOCTOR_BROADCAST_QUEUE_KIND) {
          const auditId = typeof payload.broadcastAuditId === "string" ? payload.broadcastAuditId : null;
          const clientUserId = typeof payload.clientUserId === "string" ? payload.clientUserId : null;
          const audit = auditId && UUID_RE.test(auditId) ? auditMap.get(auditId) : undefined;
          const client = clientUserId && UUID_RE.test(clientUserId) ? userMap.get(clientUserId) : undefined;
          if (audit) {
            const doc = actorToDoctorUuid(audit.actorId);
            doctorUserId = doc;
            summary.broadcast_audit_id = auditId;
            summary.client_user_id = clientUserId;
            summary.doctor_user_id = audit.actorId;
            summary.broadcast_title_short = shortTitle(audit.messageTitle, 100);
          }
          if (client) {
            summary.recipient_short_name = recipientShortName(client);
            summary.recipient_phone_masked = maskPhoneForHealthArchive(client.phoneNormalized);
          }
        }

        return {
          archivedByUserId: input.archivedByUserId,
          healthProbe: HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
          sourceKind: OUTGOING_ARCHIVE_SOURCE_KIND,
          sourceId: row.id,
          severityAtArchive: "dead" as const,
          doctorUserId,
          summaryJson: summary,
          rawErrorTruncated: truncateError(row.lastError),
        };
      });

      await tx.insert(operatorHealthFailureArchive).values(insertValues);
      await tx.delete(outgoingDeliveryQueue).where(
        inArray(
          outgoingDeliveryQueue.id,
          rows.map((r) => r.id),
        ),
      );

      return { inserted: rows.length, deleted: rows.length };
    });
  },

  async archiveIntegratorPushOutboxDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    const db = getDrizzle();
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(integratorPushOutbox)
        .where(eq(integratorPushOutbox.status, "dead"))
        .limit(Math.min(500, Math.max(1, input.limit)));

      if (rows.length === 0) {
        return { inserted: 0, deleted: 0 };
      }

      const insertValues = rows.map((row) => {
        const { reason_code, reason_ru } = humanizeIntegratorPushOutboxLastError(row.lastError);
        const summary: Record<string, unknown> = {
          reason_code,
          reason_ru,
          queue_kind: row.kind,
        };
        return {
          archivedByUserId: input.archivedByUserId,
          healthProbe: HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
          sourceKind: INTEGRATOR_OUTBOX_ARCHIVE_SOURCE_KIND,
          sourceId: String(row.id),
          severityAtArchive: "dead" as const,
          doctorUserId: null as string | null,
          summaryJson: summary,
          rawErrorTruncated: truncateError(row.lastError),
        };
      });

      await tx.insert(operatorHealthFailureArchive).values(insertValues);
      await tx.delete(integratorPushOutbox).where(
        inArray(
          integratorPushOutbox.id,
          rows.map((r) => r.id),
        ),
      );

      return { inserted: rows.length, deleted: rows.length };
    });
  },

  async archiveProjectionDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    const db = getDrizzle();
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(projectionOutbox)
        .where(eq(projectionOutbox.status, "dead"))
        .limit(Math.min(500, Math.max(1, input.limit)));

      if (rows.length === 0) {
        return { inserted: 0, deleted: 0 };
      }

      const insertValues = rows.map((row) => ({
        archivedByUserId: input.archivedByUserId,
        healthProbe: HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
        sourceKind: PROJECTION_ARCHIVE_SOURCE_KIND,
        sourceId: String(row.id),
        severityAtArchive: "dead" as const,
        doctorUserId: null as string | null,
        summaryJson: {
          event_type: row.eventType,
          idempotency_key: row.idempotencyKey,
          attempts_done: row.attemptsDone,
        },
        rawErrorTruncated: truncateError(row.lastError),
      }));

      await tx.insert(operatorHealthFailureArchive).values(insertValues);
      await tx.delete(projectionOutbox).where(
        inArray(
          projectionOutbox.id,
          rows.map((r) => r.id),
        ),
      );

      return { inserted: rows.length, deleted: rows.length };
    });
  },

  async archiveOutgoingReminderDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    const db = getDrizzle();
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outgoingDeliveryQueue)
        .where(
          and(
            eq(outgoingDeliveryQueue.status, "dead"),
            eq(outgoingDeliveryQueue.kind, OUTGOING_REMINDER_QUEUE_KIND),
            or(
              isNull(outgoingDeliveryQueue.failureClass),
              ne(outgoingDeliveryQueue.failureClass, "recipient_blocked_bot"),
            ),
          ),
        )
        .limit(Math.min(500, Math.max(1, input.limit)));

      if (rows.length === 0) {
        return { inserted: 0, deleted: 0 };
      }

      const insertValues = rows.map((row) => {
        const { reason_code, reason_ru } = humanizeOutgoingDeliveryLastError(row.lastError);
        const summary: Record<string, unknown> = {
          reason_code,
          reason_ru,
          queue_kind: row.kind,
          channel: row.channel,
        };
        return {
          archivedByUserId: input.archivedByUserId,
          healthProbe: HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
          sourceKind: OUTGOING_REMINDER_ARCHIVE_SOURCE_KIND,
          sourceId: row.id,
          severityAtArchive: "dead" as const,
          doctorUserId: null as string | null,
          summaryJson: summary,
          rawErrorTruncated: truncateError(row.lastError),
        };
      });

      await tx.insert(operatorHealthFailureArchive).values(insertValues);
      await tx.delete(outgoingDeliveryQueue).where(
        inArray(
          outgoingDeliveryQueue.id,
          rows.map((r) => r.id),
        ),
      );

      return { inserted: rows.length, deleted: rows.length };
    });
  },

  async listForAdmin(input: {
    probe: HealthFailureArchiveProbe | null;
    limit: number;
    cursor: string | null;
  }): Promise<HealthFailureArchiveListResult> {
    const db = getDrizzle();
    const limit = Math.min(100, Math.max(1, input.limit));
    const cur = decodeArchiveCursor(input.cursor);

    const wh = [];
    if (input.probe) {
      wh.push(eq(operatorHealthFailureArchive.healthProbe, input.probe));
    }
    if (cur) {
      wh.push(
        or(
          lt(operatorHealthFailureArchive.archivedAt, cur.a),
          and(eq(operatorHealthFailureArchive.archivedAt, cur.a), lt(operatorHealthFailureArchive.id, cur.i)),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(operatorHealthFailureArchive)
      .where(wh.length ? and(...wh) : undefined)
      .orderBy(desc(operatorHealthFailureArchive.archivedAt), desc(operatorHealthFailureArchive.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeArchiveCursor({ a: last.archivedAt, i: last.id })
        : null;

    const items: HealthFailureArchiveRow[] = page.map((r) => ({
      id: r.id,
      archivedAt: r.archivedAt,
      archivedByUserId: r.archivedByUserId ?? null,
      healthProbe: r.healthProbe,
      sourceKind: r.sourceKind,
      sourceId: r.sourceId,
      severityAtArchive: r.severityAtArchive,
      doctorUserId: r.doctorUserId ?? null,
      summaryJson:
        r.summaryJson !== null && typeof r.summaryJson === "object" && !Array.isArray(r.summaryJson)
          ? (r.summaryJson as Record<string, unknown>)
          : {},
      rawErrorTruncated: r.rawErrorTruncated ?? null,
    }));

    return { items, nextCursor };
  },

  async listForDoctor(input: {
    doctorUserId: string;
    limit: number;
    cursor: string | null;
  }): Promise<HealthFailureArchiveListResult> {
    const db = getDrizzle();
    const limit = Math.min(100, Math.max(1, input.limit));
    const cur = decodeArchiveCursor(input.cursor);

    const wh = [
      eq(operatorHealthFailureArchive.healthProbe, HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE),
      eq(operatorHealthFailureArchive.doctorUserId, input.doctorUserId),
    ];
    if (cur) {
      wh.push(
        or(
          lt(operatorHealthFailureArchive.archivedAt, cur.a),
          and(eq(operatorHealthFailureArchive.archivedAt, cur.a), lt(operatorHealthFailureArchive.id, cur.i)),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(operatorHealthFailureArchive)
      .where(and(...wh))
      .orderBy(desc(operatorHealthFailureArchive.archivedAt), desc(operatorHealthFailureArchive.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeArchiveCursor({ a: last.archivedAt, i: last.id })
        : null;

    const items: HealthFailureArchiveRow[] = page.map((r) => ({
      id: r.id,
      archivedAt: r.archivedAt,
      archivedByUserId: r.archivedByUserId ?? null,
      healthProbe: r.healthProbe,
      sourceKind: r.sourceKind,
      sourceId: r.sourceId,
      severityAtArchive: r.severityAtArchive,
      doctorUserId: r.doctorUserId ?? null,
      summaryJson:
        r.summaryJson !== null && typeof r.summaryJson === "object" && !Array.isArray(r.summaryJson)
          ? (r.summaryJson as Record<string, unknown>)
          : {},
      rawErrorTruncated: r.rawErrorTruncated ?? null,
    }));

    return { items, nextCursor };
  },

  async deleteArchivedBefore(cutoffIso: string): Promise<number> {
    const db = getDrizzle();
    const del = await db
      .delete(operatorHealthFailureArchive)
      .where(lt(operatorHealthFailureArchive.archivedAt, cutoffIso))
      .returning({ id: operatorHealthFailureArchive.id });
    return del.length;
  },
};
