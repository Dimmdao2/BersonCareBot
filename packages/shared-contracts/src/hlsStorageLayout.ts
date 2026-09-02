import { posix } from 'node:path';

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

/** Reject purge listing outside `media/{mediaId}/…`. */
export function isCanonicalMediaRootForId(mediaRoot: string, mediaId: string): boolean {
  return mediaRoot.replace(/\/+$/, '') === posix.join('media', mediaId);
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

/** True if `key` is an HLS artifact under `media/{mediaId}/hls/`. */
export function isTrustedHlsArtifactS3Key(mediaId: string, key: string): boolean {
  const normalizedKey = normalizeMediaS3Key(key);
  const hlsDirectory = posix.join('media', mediaId, 'hls');
  return normalizedKey === hlsDirectory || normalizedKey.startsWith(`${hlsDirectory}/`);
}

/** True if `key` is a poster artifact under `media/{mediaId}/poster/`. */
export function isTrustedPosterS3Key(mediaId: string, key: string): boolean {
  const normalizedKey = normalizeMediaS3Key(key);
  const posterDirectory = posix.join('media', mediaId, 'poster');
  return normalizedKey === posterDirectory || normalizedKey.startsWith(`${posterDirectory}/`);
}
