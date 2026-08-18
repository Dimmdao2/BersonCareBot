export type MediaThumbPhase =
  | 'ready'
  | 'source'
  | 'pending'
  | 'failed'
  | 'skipped'
  | 'non_visual';

export type MediaThumbPhaseInput = {
  kind: 'image' | 'video' | 'audio' | 'file';
  previewStatus?: string | null;
  previewSmUrl?: string | null;
  /**
   * `media_files.standard_rendition_at IS NOT NULL` — the stored object is our encoder's output,
   * not the user's upload. Only surfaces that pass this may show the file itself.
   */
  standardRendition?: boolean | null;
};

/**
 * Pure phase for grid/list/picker thumbnails.
 *
 * A raw upload is never shown (SECURITY_CANON §5). A file that went through the standard
 * rendition is no longer a raw upload, so while its thumbnail is still missing it is shown
 * directly — owner ruling 19.08: «Показ файла, пока делается миниатюра — но только после
 * конвертации». `failed`/`skipped` never reach that branch: `skipped` means the rendition was
 * never attempted (size guard), `failed` means it did not complete.
 *
 * Single source of truth for thumbnail phase derivation. Do not duplicate.
 */
export function getMediaThumbPhase(item: MediaThumbPhaseInput): MediaThumbPhase {
  if (item.kind === 'audio' || item.kind === 'file') return 'non_visual';

  const status = (item.previewStatus ?? 'pending').trim().toLowerCase();
  const sm = item.previewSmUrl?.trim();

  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  if (status === 'ready' && sm) return 'ready';

  /* Everything below here means: the thumbnail is not ready (pending, ready-without-key, drift). */
  if (item.kind === 'image' && item.standardRendition === true) return 'source';
  return 'pending';
}
