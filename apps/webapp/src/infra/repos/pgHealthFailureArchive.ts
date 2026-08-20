import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { operatorHealthFailureArchive } from '../../../db/schema/operatorHealthFailureArchive';
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
} from '@/modules/operator-health/healthFailureArchiveConstants';
import type {
  HealthFailureArchiveClearBatchResult,
  HealthFailureArchiveListResult,
  HealthFailureArchivePort,
  HealthFailureArchiveRow,
} from '@/modules/operator-health/healthFailureArchivePort';
import type { HealthFailureArchiveProbe } from '@/modules/operator-health/healthFailureArchiveConstants';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CursorPayload = { a: string; i: string };

export function encodeArchiveCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeArchiveCursor(raw: string | null | undefined): CursorPayload | null {
  if (raw == null || typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
    const o = json as Record<string, unknown>;
    const a = typeof o.a === 'string' ? o.a : null;
    const i = typeof o.i === 'string' ? o.i : null;
    if (!a || !i || !UUID_RE.test(i)) return null;
    return { a, i };
  } catch {
    return null;
  }
}

async function archivePlatformBatch(
  probe: HealthFailureArchiveProbe,
  input: { limit: number; archivedByUserId: string },
): Promise<HealthFailureArchiveClearBatchResult> {
  const limit = Math.min(500, Math.max(1, input.limit));
  const result = await runWebappNamedRoot<{
    inserted_count: number | string;
    deleted_count: number | string;
  }>(
    getWebappSqlDb(),
    'app.archive_operator_health_failures(text,integer,uuid)',
    [probe, limit, input.archivedByUserId],
    sql`SELECT * FROM app.archive_operator_health_failures(${probe}, ${limit}, ${input.archivedByUserId}::uuid)`,
  );
  return {
    inserted: Number(result.rows[0]?.inserted_count ?? 0),
    deleted: Number(result.rows[0]?.deleted_count ?? 0),
  };
}

export const pgHealthFailureArchivePort: HealthFailureArchivePort = {
  async archiveOutgoingDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    return archivePlatformBatch(HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE, input);
  },

  async archiveIntegratorPushOutboxDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    return archivePlatformBatch(HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE, input);
  },

  async archiveOutgoingReminderDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult> {
    return archivePlatformBatch(HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE, input);
  },

  async listForAdmin(input: {
    probe: HealthFailureArchiveProbe | null;
    limit: number;
    cursor: string | null;
  }): Promise<HealthFailureArchiveListResult> {
    const limit = Math.min(100, Math.max(1, input.limit));
    const cur = decodeArchiveCursor(input.cursor);
    const result = await runWebappNamedRoot<{
      id: string;
      archived_at: string;
      archived_by_user_id: string | null;
      health_probe: string;
      source_kind: string;
      source_id: string;
      severity_at_archive: string;
      summary_json: unknown;
    }>(
      getWebappSqlDb(),
      'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)',
      [input.probe, limit + 1, cur?.a ?? null, cur?.i ?? null],
      sql`SELECT * FROM app.list_platform_health_failure_archive(
        ${input.probe}, ${limit + 1}, ${cur?.a ?? null}::timestamptz, ${cur?.i ?? null}::uuid
      )`,
    );
    const rows = result.rows;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeArchiveCursor({ a: last.archived_at, i: last.id }) : null;

    const items: HealthFailureArchiveRow[] = page.map((r) => ({
      id: r.id,
      archivedAt: r.archived_at,
      archivedByUserId: r.archived_by_user_id,
      healthProbe: r.health_probe,
      sourceKind: r.source_kind,
      sourceId: r.source_id,
      severityAtArchive: r.severity_at_archive,
      doctorUserId: null,
      summaryJson:
        r.summary_json !== null && typeof r.summary_json === 'object' && !Array.isArray(r.summary_json)
          ? (r.summary_json as Record<string, unknown>)
          : {},
      rawErrorTruncated: null,
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
          and(
            eq(operatorHealthFailureArchive.archivedAt, cur.a),
            lt(operatorHealthFailureArchive.id, cur.i),
          ),
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
      hasMore && last ? encodeArchiveCursor({ a: last.archivedAt, i: last.id }) : null;

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
        r.summaryJson !== null && typeof r.summaryJson === 'object' && !Array.isArray(r.summaryJson)
          ? (r.summaryJson as Record<string, unknown>)
          : {},
      rawErrorTruncated: r.rawErrorTruncated ?? null,
    }));

    return { items, nextCursor };
  },

  /**
   * Retention is cross-organization work: it must not depend on a tenant context. Relation DELETE
   * here is closed by the tenant wall of `operator_health_failure_archive` (its only permissive
   * runtime policy demands `app_staff` plus an accepted organization), so the sweep goes through the
   * declared named root owned by the same seam owner as the archive's other two operations —
   * exactly the shape of `app.prune_integration_webhook_error_events(integer)`.
   */
  async pruneArchivedOlderThanDays(retentionDays: number): Promise<number> {
    const days = Math.min(3650, Math.max(1, Math.trunc(retentionDays)));
    const result = await runWebappNamedRoot<{ deleted_count: number | string }>(
      getWebappSqlDb(),
      'app.prune_operator_health_failure_archive(integer)',
      [days],
      sql`SELECT app.prune_operator_health_failure_archive(${days}) AS deleted_count`,
    );
    return Number(result.rows[0]?.deleted_count ?? 0);
  },
};
