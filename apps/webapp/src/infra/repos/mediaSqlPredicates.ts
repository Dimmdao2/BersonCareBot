import { sql, type SQL } from "drizzle-orm";

/** Rows visible in library / readable by GET (bare `media_files`, no alias). */
export const mediaReadableStatusPredicate = sql`(status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** Same filter with table alias `m`. */
export const mediaReadableStatusPredicateM = sql`(m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** Rows queued for background S3 removal (includes legacy `deleting`). */
export const mediaS3PurgeStatusPredicate = sql`status IN ('pending_delete', 'deleting')`;

/** @deprecated String form for legacy embeds — prefer `mediaReadableStatusPredicate` in new SQL. */
export const MEDIA_READABLE_STATUS_SQL = `(status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** @deprecated Prefer `mediaReadableStatusPredicateM`. */
export const MEDIA_READABLE_STATUS_SQL_M = `(m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** @deprecated Prefer `mediaS3PurgeStatusPredicate`. */
export const MEDIA_S3_PURGE_STATUS_SQL = `status IN ('pending_delete', 'deleting')`;

export function mediaReadableWhere(alias?: "m"): SQL {
  return alias === "m" ? mediaReadableStatusPredicateM : mediaReadableStatusPredicate;
}
