import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { logger } from "@/infra/logging/logger";

export type AuditLogStatus = "ok" | "partial_failure" | "error";

export type AuditLogWriteEntry = {
  actorId: string | null;
  action: string;
  targetId?: string | null;
  conflictKey?: string | null;
  details?: Record<string, unknown>;
  status?: AuditLogStatus;
};

/**
 * Stable key for deduping open `auto_merge_conflict` rows: sha256(sorted unique candidate UUIDs), hex.
 * Used only when all conflict classes carry non-empty `candidateIds` (plan §0).
 */
export function computeConflictKeyFromCandidateIds(candidateIds: string[]): string {
  const normalized = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new Error("computeConflictKeyFromCandidateIds: candidateIds must be non-empty");
  }
  return createHash("sha256").update(normalized.join("|"), "utf8").digest("hex");
}

/** Open-row dedupe key for channel-link ownership conflicts (distinct from merge candidate hashes). */
export function computeChannelLinkOwnershipConflictKey(
  channelCode: string,
  externalId: string,
  tokenUserId: string,
  existingUserId: string,
): string {
  const sorted = [tokenUserId, existingUserId].map((x) => x.trim()).filter(Boolean).sort();
  const payload = `channel_link_ownership|${channelCode.trim()}|${externalId.trim()}|${sorted.join("|")}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function mergeSeenEventTypes(
  existing: unknown,
  incoming: unknown,
): string[] {
  const fromArr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  };
  const a = new Set(fromArr(existing));
  for (const x of fromArr(incoming)) {
    a.add(x);
  }
  if (typeof incoming === "string" && incoming.length > 0) {
    a.add(incoming);
  }
  return [...a].sort();
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Append-only audit row. Call after COMMIT/ROLLBACK of the main operation (separate implicit transaction).
 * Failure is logged and does not throw (fire-and-forget from callers).
 */
export async function writeAuditLog(pool: Pool, entry: AuditLogWriteEntry): Promise<void> {
  const status: AuditLogStatus = entry.status ?? "ok";
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_id, conflict_key, details, status)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6)`,
      [
        entry.actorId,
        entry.action,
        entry.targetId ?? null,
        entry.conflictKey ?? null,
        JSON.stringify(entry.details ?? {}),
        status,
      ],
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, "writeAuditLog failed");
  }
}

export type UpsertOpenConflictLogInput = {
  actorId: string | null;
  candidateIds: string[];
  /** Optional `admin_audit_log.target_id` (e.g. primary platform user id for display). */
  targetId?: string | null;
  /** Defaults to `auto_merge_conflict`. */
  action?: string;
  /**
   * When set, used as `conflict_key` instead of {@link computeConflictKeyFromCandidateIds}.
   * Required for actions that must not collide with merge keys (e.g. channel-link ownership).
   */
  conflictKey?: string | null;
  /** Merged into stored details; include `eventType` for seenEventTypes aggregation */
  details: Record<string, unknown>;
  status?: AuditLogStatus;
};

export type UpsertOpenConflictLogResult =
  | { kind: "anomaly" }
  | { kind: "conflict"; insertedFirst: boolean }
  | { kind: "skipped" };

/**
 * Dedup open rows by `conflict_key` among unresolved (`resolved_at IS NULL`) audit rows.
 * Default `action` is `auto_merge_conflict`; pass `action` + `conflictKey` for channel-link ownership, etc.
 * If candidateIds is empty, do not call this — use `writeAuditLog` with `auto_merge_conflict_anomaly` (plan §0).
 */
export async function upsertOpenConflictLog(
  pool: Pool,
  input: UpsertOpenConflictLogInput,
): Promise<UpsertOpenConflictLogResult> {
  const { candidateIds } = input;
  const action = (input.action ?? "auto_merge_conflict").trim() || "auto_merge_conflict";
  if (!candidateIds.length) {
    // Plan contract: empty candidateIds is anomaly-path without conflict_key.
    await writeAuditLog(pool, {
      actorId: input.actorId,
      action: "auto_merge_conflict_anomaly",
      targetId: input.targetId ?? null,
      details: { ...input.details, candidateIds: [] },
      status: input.status ?? "error",
    });
    return { kind: "anomaly" };
  }
  let conflictKey: string;
  const overrideKey = input.conflictKey?.trim();
  if (overrideKey) {
    conflictKey = overrideKey;
  } else {
    try {
      conflictKey = computeConflictKeyFromCandidateIds(candidateIds);
    } catch (err) {
      logger.error({ err }, "upsertOpenConflictLog: conflict key failed");
      return { kind: "skipped" };
    }
  }

  const status: AuditLogStatus = input.status ?? "error";
  const baseDetails: Record<string, unknown> = { ...input.details, candidateIds };
  const incomingSeenEventTypes = mergeSeenEventTypes(
    baseDetails.seenEventTypes,
    typeof baseDetails.eventType === "string" ? [baseDetails.eventType] : [],
  );

  let client: PoolClient | null = null;
  let insertedFirst = false;
  try {
    client = await pool.connect();
    if (!client) return { kind: "skipped" };
    await client.query("BEGIN");
    const existing = await client.query<{
      id: string;
      details: Record<string, unknown>;
      repeat_count: number;
    }>(
      `SELECT id, details, repeat_count
       FROM admin_audit_log
       WHERE conflict_key = $1 AND resolved_at IS NULL
       FOR UPDATE`,
      [conflictKey],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const mergedDetails = {
        ...row.details,
        ...baseDetails,
        seenEventTypes: mergeSeenEventTypes(row.details.seenEventTypes, incomingSeenEventTypes),
      };
      await client.query(
        `UPDATE admin_audit_log
         SET details = $2::jsonb,
             status = $3,
             repeat_count = $4 + 1,
             last_seen_at = now()
         WHERE id = $1::uuid`,
        [row.id, JSON.stringify(mergedDetails), status, row.repeat_count],
      );
    } else {
      const firstDetails = {
        ...baseDetails,
        seenEventTypes: incomingSeenEventTypes,
      };
      try {
        await client.query(
          `INSERT INTO admin_audit_log (actor_id, action, target_id, conflict_key, details, status, repeat_count, last_seen_at)
           VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, 1, now())`,
          [input.actorId, action, input.targetId ?? null, conflictKey, JSON.stringify(firstDetails), status],
        );
        insertedFirst = true;
      } catch (err) {
        if (!isPgUniqueViolation(err)) throw err;
        // Race-safe fallback: another tx inserted open row with same conflict_key.
        const collision = await client.query<{
          id: string;
          details: Record<string, unknown>;
          repeat_count: number;
        }>(
          `SELECT id, details, repeat_count
           FROM admin_audit_log
           WHERE conflict_key = $1 AND resolved_at IS NULL
           FOR UPDATE`,
          [conflictKey],
        );
        if (collision.rows.length === 0) throw err;
        const row = collision.rows[0];
        const mergedDetails = {
          ...row.details,
          ...baseDetails,
          seenEventTypes: mergeSeenEventTypes(row.details.seenEventTypes, incomingSeenEventTypes),
        };
        await client.query(
          `UPDATE admin_audit_log
           SET details = $2::jsonb,
               status = $3,
               repeat_count = $4 + 1,
               last_seen_at = now()
           WHERE id = $1::uuid`,
          [row.id, JSON.stringify(mergedDetails), status, row.repeat_count],
        );
      }
    }
    await client.query("COMMIT");
    return { kind: "conflict", insertedFirst };
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    logger.error({ err }, "upsertOpenConflictLog failed");
    return { kind: "skipped" };
  } finally {
    client?.release();
  }
}

export type AdminAuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  conflict_key: string | null;
  details: Record<string, unknown>;
  status: AuditLogStatus;
  repeat_count: number;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  actor_display_name: string | null;
};

export type ListAdminAuditLogParams = {
  page: number;
  limit: number;
  action?: string;
  targetId?: string;
  /**
   * Match rows where this platform user is `target_id`, or listed in `details.candidateIds` for
   * `auto_merge_conflict`, or matches `details.targetId` / `details.duplicateId` for `user_merge` /
   * `integrator_user_merge`.
   */
  involvesPlatformUserId?: string;
  status?: AuditLogStatus;
  fromInclusive?: string;
  toInclusive?: string;
};

/** Count of distinct open `auto_merge_conflict` rows (`resolved_at IS NULL`). */
export async function countOpenAutoMergeConflicts(pool: Pool): Promise<number> {
  try {
    const r = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
       FROM admin_audit_log
       WHERE action = 'auto_merge_conflict' AND resolved_at IS NULL`,
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch (err) {
    logger.error({ err }, "countOpenAutoMergeConflicts failed");
    return 0;
  }
}

export type ListAdminAuditLogResult = {
  items: AdminAuditLogRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listAdminAuditLog(pool: Pool, params: ListAdminAuditLogParams): Promise<ListAdminAuditLogResult> {
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["1=1"];
  const values: unknown[] = [];
  let i = 1;

  if (params.action) {
    conditions.push(`l.action = $${i}`);
    values.push(params.action);
    i++;
  }
  if (params.targetId) {
    conditions.push(`l.target_id = $${i}`);
    values.push(params.targetId);
    i++;
  }
  if (params.involvesPlatformUserId?.trim()) {
    const uid = params.involvesPlatformUserId.trim();
    conditions.push(
      `(l.target_id = $${i} OR (
        l.action = 'auto_merge_conflict' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(l.details->'candidateIds', '[]'::jsonb)) AS cid
          WHERE cid = $${i}
        )
      ) OR (
        l.action = 'channel_link_ownership_conflict' AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(l.details->'candidateIds', '[]'::jsonb)) AS cid
          WHERE cid = $${i}
        )
      ) OR (
        l.action IN ('user_merge', 'integrator_user_merge') AND (
          l.details->>'targetId' = $${i} OR l.details->>'duplicateId' = $${i}
        )
      ))`,
    );
    values.push(uid);
    i++;
  }
  if (params.status) {
    conditions.push(`l.status = $${i}`);
    values.push(params.status);
    i++;
  }
  if (params.fromInclusive) {
    conditions.push(`l.created_at >= $${i}::timestamptz`);
    values.push(params.fromInclusive);
    i++;
  }
  if (params.toInclusive) {
    conditions.push(`l.created_at <= $${i}::timestamptz`);
    values.push(params.toInclusive);
    i++;
  }

  const whereSql = conditions.join(" AND ");
  const filterValues = [...values];

  const countRes = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM admin_audit_log l WHERE ${whereSql}`,
    filterValues,
  );
  const total = Number(countRes.rows[0]?.n ?? 0);

  const listSql = `
    SELECT
      l.id,
      l.actor_id,
      l.action,
      l.target_id,
      l.conflict_key,
      l.details,
      l.status,
      l.repeat_count,
      l.last_seen_at,
      l.resolved_at,
      l.created_at,
      pu.display_name AS actor_display_name
    FROM admin_audit_log l
    LEFT JOIN platform_users pu ON pu.id = l.actor_id
    WHERE ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `;
  const listValues = [...filterValues, limit, offset];

  const listRes = await pool.query<AdminAuditLogRow>(listSql, listValues);

  return {
    items: listRes.rows.map((row) => ({
      ...row,
      details: (row.details ?? {}) as Record<string, unknown>,
    })),
    total,
    page,
    limit,
  };
}
