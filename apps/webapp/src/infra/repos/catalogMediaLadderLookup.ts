/**
 * The one door onto a catalog media row's rendition state (owner ruling 19.08.2026,
 * `docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md`): every caller that needs to know "is this
 * image's thumbnail ready, is the file itself safe to show, or is there no conversion at all"
 * comes through here — a single batched query, called once per page, never per image.
 *
 * Returns the raw facts (`preview_sm_key`, `preview_md_key`, `preview_status`,
 * `standard_rendition_at IS NOT NULL`); the caller does not interpret them further. The
 * ladder itself — thumbnail → stored re-encode → "готовится" → error — is decided client-side
 * by `getMediaThumbPhase` (`shared/ui/{doctor,patient}/media/mediaThumbState.ts`), which this
 * lookup feeds. Do not duplicate this query; extend this function instead.
 */
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { MediaPreviewStatus } from '@/modules/media/types';
import { mediaPreviewUrlById } from '@/shared/lib/mediaPreviewUrls';

export type CatalogMediaLadderRow = {
  previewSmUrl: string | null;
  previewMdUrl: string | null;
  previewStatus: MediaPreviewStatus;
  /** `media_files.standard_rendition_at IS NOT NULL` — see `MediaPreviewUiModel.standardRendition`. */
  standardRendition: boolean;
};

/**
 * Looks up rendition state for a batch of `media_files.id`s in one query.
 * Empty input short-circuits without touching the database.
 */
export async function catalogMediaLadderLookup(
  mediaIds: readonly string[],
): Promise<Map<string, CatalogMediaLadderRow>> {
  const uniqueIds = [...new Set(mediaIds.map((id) => id.toLowerCase()))];
  const out = new Map<string, CatalogMediaLadderRow>();
  if (uniqueIds.length === 0) return out;

  const res = await runWebappPgText<{
    id: string;
    preview_sm_key: string | null;
    preview_md_key: string | null;
    preview_status: string | null;
    standard_rendition: boolean;
  }>(
    `SELECT id::text AS id, preview_sm_key, preview_md_key, preview_status,
            (standard_rendition_at IS NOT NULL) AS standard_rendition
       FROM media_files
      WHERE id = ANY($1::uuid[])`,
    [uniqueIds],
  );

  for (const row of res.rows) {
    const id = row.id.toLowerCase();
    out.set(id, {
      previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(id, 'sm') : null,
      previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(id, 'md') : null,
      previewStatus: (row.preview_status as MediaPreviewStatus | null) ?? 'pending',
      standardRendition: row.standard_rendition === true,
    });
  }
  return out;
}
