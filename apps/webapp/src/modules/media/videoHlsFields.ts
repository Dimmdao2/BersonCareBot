import type { MediaAvailableQuality, VideoProcessingStatus } from './types';

const PROCESSING: VideoProcessingStatus[] = ['none', 'pending', 'processing', 'ready', 'failed'];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Normalizes `media_files.video_processing_status` for API types.
 * Returns null for NULL/invalid (treat as untracked / legacy).
 */
export function parseVideoProcessingStatus(
  raw: string | null | undefined,
): VideoProcessingStatus | null {
  if (raw == null || raw === '') return null;
  return (PROCESSING as readonly string[]).includes(raw) ? (raw as VideoProcessingStatus) : null;
}

/**
 * Parses `media_files.available_qualities_json` (expected: array of objects).
 * Returns null for empty/invalid.
 */
export function parseAvailableQualitiesJson(raw: unknown): MediaAvailableQuality[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: MediaAvailableQuality[] = [];
  for (const el of raw) {
    if (!isRecord(el)) continue;
    const entry: MediaAvailableQuality = {};
    if (typeof el.label === 'string' && el.label.trim() !== '') {
      entry.label = el.label.trim();
    }
    if (typeof el.path === 'string' && el.path.trim() !== '') {
      entry.path = el.path.trim();
    }
    if (typeof el.renditionId === 'string' && el.renditionId.trim() !== '') {
      entry.renditionId = el.renditionId;
    }
    if (typeof el.height === 'number' && Number.isFinite(el.height)) {
      entry.height = el.height;
    }
    if (typeof el.bandwidth === 'number' && Number.isFinite(el.bandwidth)) {
      entry.bandwidth = el.bandwidth;
    }
    if (Object.keys(entry).length > 0) {
      out.push(entry);
    }
  }
  return out.length > 0 ? out : null;
}
