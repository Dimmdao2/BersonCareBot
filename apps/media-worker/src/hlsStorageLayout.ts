import { posix } from "node:path";

/**
 * VIDEO_HLS_DELIVERY phase-03: canonical private-bucket layout next to source MP4.
 *
 * Source: `s3_key` = `media/{mediaId}/{filename}` (existing uploads) — **never** removed by transcode.
 * HLS tree: `media/{mediaId}/hls/master.m3u8`, `.../hls/720p/index.m3u8`, segments, etc.
 * Poster: `media/{mediaId}/poster/poster.jpg` (not under `hls/`).
 *
 * Keep in sync with `apps/webapp/src/shared/lib/hlsStorageLayout.ts` (verified in CI: `pnpm run check:hls-helpers-sync`).
 */
export function mediaRootFromSourceS3Key(s3Key: string): string {
  return posix.dirname(s3Key.replace(/\/+$/, ""));
}

export function hlsTreePrefixFromMediaRoot(mediaRoot: string): string {
  return posix.join(mediaRoot.replace(/\/+$/, ""), "hls");
}

export function posterObjectKeyFromMediaRoot(mediaRoot: string): string {
  return posix.join(mediaRoot.replace(/\/+$/, ""), "poster", "poster.jpg");
}

export function masterPlaylistKeyFromMediaRoot(mediaRoot: string): string {
  return posix.join(hlsTreePrefixFromMediaRoot(mediaRoot), "master.m3u8");
}

/** Reject purge listing outside `media/{mediaId}/…`. */
export function isCanonicalMediaRootForId(mediaRoot: string, mediaId: string): boolean {
  return mediaRoot.replace(/\/+$/, "") === posix.join("media", mediaId);
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
  const fromDb = params.hlsArtifactPrefix?.trim().replace(/\/+$/, "");
  if (!fromDb) return canonical;
  if (fromDb === canonical || fromDb.startsWith(`${canonical}/`)) return fromDb;
  return canonical;
}

/** Prefix for listing poster objects (poster.jpg or future assets). */
export function resolvePosterPurgeListPrefix(mediaId: string, sourceS3Key: string): string | null {
  const root = mediaRootFromSourceS3Key(sourceS3Key);
  if (!isCanonicalMediaRootForId(root, mediaId)) return null;
  return posix.join(root, "poster");
}

/** Trim + strip trailing slashes (S3 object keys use `/` as separator). */
export function normalizeMediaS3Key(key: string): string {
  return key.trim().replace(/\/+$/, "");
}

/**
 * True if `key` is an object under `media/{mediaId}/hls/` (master, variants, segments).
 * Used before purge deletes an explicit `hls_master_playlist_s3_key` from DB.
 */
export function isTrustedHlsArtifactS3Key(mediaId: string, key: string): boolean {
  const k = normalizeMediaS3Key(key);
  const hlsDir = posix.join("media", mediaId, "hls");
  return k === hlsDir || k.startsWith(`${hlsDir}/`);
}

/**
 * True if `key` is under `media/{mediaId}/poster/` (or exactly the poster dir key — unlikely).
 * Used before purge deletes an explicit `poster_s3_key` from DB.
 */
export function isTrustedPosterS3Key(mediaId: string, key: string): boolean {
  const k = normalizeMediaS3Key(key);
  const posterDir = posix.join("media", mediaId, "poster");
  return k === posterDir || k.startsWith(`${posterDir}/`);
}
