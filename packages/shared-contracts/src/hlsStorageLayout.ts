import { posix } from 'node:path';

/**
 * TEMPORARY (М7 migration seam, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`; correction-stage
 * finding F-1, audit `raw-bucket-audit-01`). Dies with the last pre-M7 key — that is its ONLY
 * reason to exist.
 *
 * Which physical bucket an EXISTING `library`-target source key lives in cannot be read from
 * `storage_target`: that column is a database enum, not a record of whether the ops-side object
 * relocation has run. The key's own shape already carries that fact and is the single source of
 * truth for it — never a HEAD probe, never "try raw, fall back to hot".
 *
 * The rule is stated POSITIVELY around the one shape we ourselves mint into the raw bucket, and
 * everything else is hot: `s3RawObjectKey` writes exactly `<folder>/media/<mediaId>/<file>` (four
 * segments, `media` second — the folder is the owning organization's id, or the reserved
 * `platform` folder for platform-owned rows). Anything else is a pre-M7 key and physically sits in
 * the hot bucket.
 *
 * Стало положительным правилом 12.09.2026, и не из любви к симметрии. Перечисление старых форм
 * («ключ начинается с `media/`») молча ошибается на ТРЕТЬЕЙ форме: на DEV нашлись четыре
 * `library`-строки с ключом `patient-files/<id>/<файл>` — наследство до разделения целей. Прежний
 * предикат объявлял их сырыми, объекты же лежат в горячем, и следствие было видно в данных: у всех
 * четырёх `standard_rendition_at IS NULL`, у трёх `preview_status = 'failed'` — воркер не мог
 * прочитать исходник, которого в сыром бакете нет и никогда не было. Перечислять старое нельзя:
 * старых форм столько, сколько их было в истории, и следующую мы снова узнаем по сломанному файлу.
 * Новую форму мы создаём сами и знаем её точно — поэтому проверяем её, а не её отрицание.
 *
 * Callers gate this on `target === 'library'` themselves (a `patient` key is never raw regardless
 * of shape — patient storage is not split by M7).
 */
export function isLegacyHotMediaSourceKey(key: string): boolean {
  const segments = key.trim().replace(/^\/+/, '').split('/');
  const isRawUploadShape = segments.length === 4 && segments[1] === 'media';
  return !isRawUploadShape;
}

/** Canonical private-bucket layout for source media, HLS artifacts, and poster assets. */
export function mediaRootFromSourceS3Key(s3Key: string): string {
  return posix.dirname(s3Key.replace(/\/+$/, ''));
}

export function hlsTreePrefixFromMediaRoot(mediaRoot: string): string {
  return posix.join(mediaRoot.replace(/\/+$/, ''), 'hls');
}

export function posterObjectKeyFromMediaRoot(mediaRoot: string): string {
  return posix.join(mediaRoot.replace(/\/+$/, ''), 'poster', 'poster.jpg');
}

export function masterPlaylistKeyFromMediaRoot(mediaRoot: string): string {
  return posix.join(hlsTreePrefixFromMediaRoot(mediaRoot), 'master.m3u8');
}

/**
 * Reject purge listing outside `media/{mediaId}/…` — or, since M7 (raw upload bucket, org-prefixed
 * source keys), `{organizationId}/media/{mediaId}/…`: exactly ONE extra leading segment is
 * tolerated, never more. The hot bucket's HLS/poster tree is derived from this same root
 * (`hlsTreePrefixFromMediaRoot` etc.), so a library-target video whose source now lives at
 * `<orgId>/media/<id>/source.mp4` produces HLS at `<orgId>/media/<id>/hls/…` — still exactly two
 * path segments away from `media/<id>`, never a deeper or attacker-widened prefix.
 */
export function isCanonicalMediaRootForId(mediaRoot: string, mediaId: string): boolean {
  const segments = mediaRoot.replace(/\/+$/, '').split('/').filter((s) => s.length > 0);
  if (segments.length !== 2 && segments.length !== 3) return false;
  const [dir, id] = segments.slice(-2);
  return dir === 'media' && id === mediaId;
}

/**
 * Hot-bucket roots where THIS media's encoder artifacts (HLS tree, poster) may physically live.
 *
 * There are two, and only during the М7 migration seam. The hot tree is derived from the source
 * key's root at the moment the artifact is produced, and the source key moves: a video uploaded
 * BEFORE М7 got its HLS/poster under `media/<id>/…` and keeps them there after the ops relocation
 * moves its source to `<orgId>/media/<id>/…` (the relocation copies the SOURCE only — see
 * `app-layer/media/rawBucketSourceMigration.ts`), while a video uploaded AFTER М7 has both under
 * `<orgId>/media/<id>/…`. Deriving the artifact root from the source key alone is therefore
 * correct for exactly one of those two populations, and wrong — silently, at purge time — for the
 * other.
 *
 * Both roots are scoped to this `mediaId` by {@link isCanonicalMediaRootForId}, so listing both can
 * only ever reach this media's own artifacts; it can never widen to another media or to a bucket
 * root. Dies with the last pre-М7 key, exactly like {@link isLegacyHotMediaSourceKey}.
 */
function hotArtifactRootsForMedia(mediaId: string, sourceS3Key: string): string[] {
  const root = mediaRootFromSourceS3Key(sourceS3Key);
  if (!isCanonicalMediaRootForId(root, mediaId)) return [];
  const legacyRoot = posix.join('media', mediaId);
  return root === legacyRoot ? [root] : [root, legacyRoot];
}

/**
 * Prefixes to list when purging a media's HLS tree. Empty = nothing safe to list.
 *
 * A recorded `hls_artifact_prefix` wins whenever it is a trusted artifact prefix OF THIS media
 * ({@link isTrustedHlsArtifactS3Key}) — it is the only record of where the tree actually is, and
 * after the М7 source relocation it is no longer under the source key's root. Requiring it to sit
 * under that root (the pre-М7 rule) turned every relocated video's segments into permanent hot-bucket
 * orphans while the purge reported success.
 */
export function resolveHlsPurgeListPrefixes(params: {
  mediaId: string;
  sourceS3Key: string;
  hlsArtifactPrefix: string | null;
}): string[] {
  const roots = hotArtifactRootsForMedia(params.mediaId, params.sourceS3Key);
  if (roots.length === 0) return [];
  const fromDb = params.hlsArtifactPrefix?.trim().replace(/\/+$/, '');
  if (fromDb && isTrustedHlsArtifactS3Key(params.mediaId, fromDb)) return [fromDb];
  return roots.map(hlsTreePrefixFromMediaRoot);
}

/** Prefixes for listing poster objects (poster.jpg or future assets); see {@link hotArtifactRootsForMedia}. */
export function resolvePosterPurgeListPrefixes(mediaId: string, sourceS3Key: string): string[] {
  return hotArtifactRootsForMedia(mediaId, sourceS3Key).map((root) => posix.join(root, 'poster'));
}

/** Trim + strip trailing slashes (S3 object keys use `/` as separator). */
export function normalizeMediaS3Key(key: string): string {
  return key.trim().replace(/\/+$/, '');
}

/**
 * True if `key` sits at or under `.../media/{mediaId}/{subdir}/`, with at most one extra leading
 * path segment (the M7 organization-id prefix the hot bucket's HLS/poster tree inherits from the
 * org-prefixed raw source key) before `media/{mediaId}`. Never trusts a deeper or shorter path.
 */
function isTrustedMediaSubtreeKey(mediaId: string, key: string, subdir: string): boolean {
  const normalizedKey = normalizeMediaS3Key(key);
  const suffix = posix.join('media', mediaId, subdir);
  if (normalizedKey === suffix || normalizedKey.startsWith(`${suffix}/`)) return true;
  const marker = `/${suffix}`;
  const idx = normalizedKey.indexOf(marker);
  if (idx <= 0) return false;
  const prefix = normalizedKey.slice(0, idx);
  const rest = normalizedKey.slice(idx + marker.length);
  return prefix.length > 0 && !prefix.includes('/') && (rest === '' || rest.startsWith('/'));
}

/** True if `key` is an HLS artifact under `media/{mediaId}/hls/` (see {@link isTrustedMediaSubtreeKey}). */
export function isTrustedHlsArtifactS3Key(mediaId: string, key: string): boolean {
  return isTrustedMediaSubtreeKey(mediaId, key, 'hls');
}

/** True if `key` is a poster artifact under `media/{mediaId}/poster/` (see {@link isTrustedMediaSubtreeKey}). */
export function isTrustedPosterS3Key(mediaId: string, key: string): boolean {
  return isTrustedMediaSubtreeKey(mediaId, key, 'poster');
}
