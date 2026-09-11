import { posix } from 'node:path';

export type NormalizeHlsPathResult =
  | { ok: true; segments: string[] }
  | { ok: false; reason: 'empty' | 'unsafe_segment' };

export function normalizeHlsUrlPathSegments(raw: string[] | undefined): NormalizeHlsPathResult {
  if (!raw || raw.length === 0) return { ok: false, reason: 'empty' };
  const segments: string[] = [];
  for (const seg of raw) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return { ok: false, reason: 'unsafe_segment' };
    }
    if (decoded === '' || decoded === '.' || decoded === '..')
      return { ok: false, reason: 'unsafe_segment' };
    if (decoded.includes('/') || decoded.includes('\\'))
      return { ok: false, reason: 'unsafe_segment' };
    segments.push(decoded);
  }
  return { ok: true, segments };
}

export function hlsArtifactObjectKey(mediaId: string, segments: string[]): string {
  return posix.join('media', mediaId, 'hls', ...segments);
}

export function isHlsPlaylistPath(segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  return last.toLowerCase().endsWith('.m3u8');
}

export function hlsArtifactSupportsHttpRange(segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  return /\.(ts|m4s|aac|mp4|vtt)$/i.test(last);
}

export function inferHlsArtifactKind(segments: string[]): 'master' | 'variant' | 'segment' {
  const joined = segments.join('/');
  if (joined.toLowerCase().endsWith('master.m3u8')) return 'master';
  if (joined.toLowerCase().endsWith('.m3u8')) return 'variant';
  return 'segment';
}

/**
 * Quality read from the segment path, not a database lookup (VIDEO_DELIVERY_COST_AND_METERING
 * 11.09.2026). The worker lays out every rendition under `hls/<rung.label>/…`
 * (`processTranscodeJob.ts`, e.g. `hls/576p/seg_003.m4s`) and the top-level master playlist
 * directly under `hls/master.m3u8` with no rung directory — there is no per-quality meaning for it,
 * so it gets the `master` sentinel instead of a rung label.
 */
export const HLS_MASTER_PLAYLIST_QUALITY_SENTINEL = 'master';

export function hlsArtifactQualityFromPath(segments: string[]): string {
  if (segments.length < 2) return HLS_MASTER_PLAYLIST_QUALITY_SENTINEL;
  return segments[0]!;
}
