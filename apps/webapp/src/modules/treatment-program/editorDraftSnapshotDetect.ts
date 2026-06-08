/** Heuristics: editor-batch draft preview vs canonical catalog snapshot (buildSnapshot). */

function mediaRowRecord(row: unknown): Record<string, unknown> | null {
  return row != null && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
}

function playableUrlLooksLikePreviewOnly(url: string): boolean {
  return /\/preview\/(?:sm|md)\/?$/i.test(url.trim());
}

/** Top-level `media[]` with preview-only URL (draft thumb), not canonical `/api/media/{uuid}`. */
export function catalogMediaArrayHasPreviewOnlyUrls(media: unknown): boolean {
  if (!Array.isArray(media) || media.length === 0) return false;
  for (const raw of media) {
    const o = mediaRowRecord(raw);
    if (!o) continue;
    const url =
      typeof o.mediaUrl === "string"
        ? o.mediaUrl
        : typeof o.url === "string"
          ? o.url
          : "";
    if (url.trim() && playableUrlLooksLikePreviewOnly(url)) return true;
  }
  return false;
}

/** Exercise snapshot from browser draft uses `mediaUrl`/`mediaType`; catalog uses `url`/`type`. */
export function exerciseInstanceSnapshotNeedsCatalogRebuild(snapshot: Record<string, unknown>): boolean {
  const media = snapshot.media;
  if (!Array.isArray(media) || media.length === 0) return false;
  for (const raw of media) {
    const o = mediaRowRecord(raw);
    if (!o) continue;
    if (Object.prototype.hasOwnProperty.call(o, "mediaUrl")) return true;
    if (Object.prototype.hasOwnProperty.call(o, "mediaType") && !Object.prototype.hasOwnProperty.call(o, "type")) {
      return true;
    }
    const url = typeof o.url === "string" ? o.url : "";
    if (url.trim() && playableUrlLooksLikePreviewOnly(url)) return true;
  }
  return false;
}

export function clinicalTestInstanceSnapshotNeedsCatalogRebuild(snapshot: Record<string, unknown>): boolean {
  const tests = snapshot.tests;
  if (!Array.isArray(tests)) return false;
  for (const raw of tests) {
    const t = mediaRowRecord(raw);
    if (!t) continue;
    if (catalogMediaArrayHasPreviewOnlyUrls(t.media)) return true;
  }
  return false;
}

export function instanceStageItemSnapshotNeedsCatalogRebuild(
  itemType: string,
  snapshot: Record<string, unknown>,
): boolean {
  if (itemType === "exercise") return exerciseInstanceSnapshotNeedsCatalogRebuild(snapshot);
  if (itemType === "recommendation") return catalogMediaArrayHasPreviewOnlyUrls(snapshot.media);
  if (itemType === "clinical_test") return clinicalTestInstanceSnapshotNeedsCatalogRebuild(snapshot);
  return false;
}

/**
 * SQL-фрагмент для WHERE (PostgreSQL jsonpath `@?`).
 * Консервативный префильтр: backfill дополнительно проверяет `instanceStageItemSnapshotNeedsCatalogRebuild`.
 */
export const EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE = `(
  (ti.item_type = 'exercise' AND jsonb_typeof(ti.snapshot->'media') = 'array' AND (
    ti.snapshot @? '$.media[*].mediaUrl'
    OR ti.snapshot @? '$.media[*] ? (exists(@.mediaType) && !exists(@.type))'
    OR ti.snapshot @? '$.media[*].url ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
    OR ti.snapshot @? '$.media[*].mediaUrl ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
  ))
  OR (ti.item_type = 'recommendation' AND jsonb_typeof(ti.snapshot->'media') = 'array' AND (
    ti.snapshot @? '$.media[*].mediaUrl ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
    OR ti.snapshot @? '$.media[*].url ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
  ))
  OR (ti.item_type = 'clinical_test' AND jsonb_typeof(ti.snapshot->'tests') = 'array' AND (
    ti.snapshot @? '$.tests[*].media[*].mediaUrl ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
    OR ti.snapshot @? '$.tests[*].media[*].url ? (@ like_regex "/preview/(sm|md)/?$" flag "i")'
  ))
)`;
