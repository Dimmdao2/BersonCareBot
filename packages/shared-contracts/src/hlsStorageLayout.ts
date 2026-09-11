import { posix } from 'node:path';

/**
 * TEMPORARY (М7 migration seam, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`; correction-stage
 * finding F-1, audit `raw-bucket-audit-01`). Dies with the last pre-M7 key — that is its ONLY
 * reason to exist.
 *
 * Which physical bucket an EXISTING `library`-target source key lives in cannot be read from
 * `storage_target`: that column is a database enum, not a record of whether the ops-side object
 * relocation has run. The key's own shape already carries that fact and is the single source of
 * truth for it — a fresh (post-M7) key starts with the owning organization's id
 * (`<orgId>/media/<mediaId>/…`, written by `s3RawObjectKey`); a not-yet-migrated key starts
 * literally with `media/` (pre-M7 shape, `s3ObjectKey`) and still physically sits in the hot
 * bucket. One key's shape decides exactly one bucket — never a HEAD probe, never "try raw, fall
 * back to hot".
 *
 * Callers gate this on `target === 'library'` themselves (a `patient` key is never raw regardless
 * of shape — patient storage is not split by M7).
 */
export function isLegacyHotMediaSourceKey(key: string): boolean {
  return key.trim().startsWith('media/');
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

/** Normalized HLS prefix for purge: must live under mediaRoot/hls. */
export function resolveHlsPurgeListPrefix(params: {
  mediaId: string;
  sourceS3Key: string;
  hlsArtifactPrefix: string | null;
}): string | null {
  const root = mediaRootFromSourceS3Key(params.sourceS3Key);
  if (!isCanonicalMediaRootForId(root, params.mediaId)) return null;
  const canonical = hlsTreePrefixFromMediaRoot(root);
  const fromDb = params.hlsArtifactPrefix?.trim().replace(/\/+$/, '');
  if (!fromDb) return canonical;
  if (fromDb === canonical || fromDb.startsWith(`${canonical}/`)) return fromDb;
  return canonical;
}

/** Prefix for listing poster objects (poster.jpg or future assets). */
export function resolvePosterPurgeListPrefix(mediaId: string, sourceS3Key: string): string | null {
  const root = mediaRootFromSourceS3Key(sourceS3Key);
  if (!isCanonicalMediaRootForId(root, mediaId)) return null;
  return posix.join(root, 'poster');
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
