/**
 * The one door onto a catalog media item's rendition state (owner ruling 19.08.2026,
 * `docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md`): every caller that needs to know "is this
 * image's thumbnail ready, is the file itself safe to show, or is there no conversion at all"
 * comes through here — a single batched query, called once per page, never per image.
 *
 * It takes the media URL as stored, not a parsed id, because there are two kinds of catalog media
 * and only this door knows how to answer for both:
 *   * `/api/media/{uuid}` — a file in our library, answered from its own `media_files` row;
 *   * a hosted-video link (`hostingEmbedUrls.ts#canonicalUrl`) — answered from the service
 *     `media_files` row that holds the cover we downloaded once for this clinic
 *     (`usage_purpose = 'hosted_video_preview'`).
 * Callers used to parse the id themselves and then had no answer at all for a hosted link; that
 * duplicated parse is gone. The returned URL is always ours (`/api/media/{id}/preview/{size}`) —
 * a provider's thumbnail URL never leaves this process.
 *
 * Returns the raw facts (`preview_sm_key`, `preview_md_key`, `preview_status`,
 * `standard_rendition_at IS NOT NULL`); the caller does not interpret them further. The
 * ladder itself — thumbnail → stored re-encode → "готовится" → error — is decided client-side
 * by `getMediaThumbPhase` (`shared/ui/{doctor,patient}/media/mediaThumbState.ts`), which this
 * lookup feeds. Do not duplicate this query; extend this function instead.
 */
import { and, eq, inArray, or } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { mediaFiles } from '../../../db/schema/schema';
import type { MediaPreviewStatus } from '@/modules/media/types';
import { parseHostedVideoLink } from '@/shared/lib/hostingEmbedUrls';
import { mediaPreviewUrlById, parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';

export type CatalogMediaLadderRow = {
  previewSmUrl: string | null;
  previewMdUrl: string | null;
  previewStatus: MediaPreviewStatus;
  /** `media_files.standard_rendition_at IS NOT NULL` — see `MediaPreviewUiModel.standardRendition`. */
  standardRendition: boolean;
};

export type CatalogMediaLadder = {
  /**
   * Ladder facts for one media URL from the batch, or `undefined` when the row is gone.
   *
   * A hosted link whose cover row does not exist yet is not "gone": nothing is being converted
   * for it and nothing will be until a save queues one, which on the ladder is exactly
   * `skipped` — «превью не создаётся». Answering `pending` there would promise a conversion
   * that is not running.
   */
  get(mediaUrl: string): CatalogMediaLadderRow | undefined;
  /** Number of rows the query actually returned. */
  size: number;
};

const HOSTED_ABSENT: CatalogMediaLadderRow = {
  previewSmUrl: null,
  previewMdUrl: null,
  previewStatus: 'skipped',
  standardRendition: false,
};

/** `/api/media/{uuid}` → row key; hosted link → its canonical form; anything else → null. */
function ladderKey(mediaUrl: string): { kind: 'file' | 'hosted'; key: string } | null {
  const fileId = parseMediaFileIdFromAppUrl(mediaUrl);
  if (fileId) return { kind: 'file', key: fileId };
  const hosted = parseHostedVideoLink(mediaUrl);
  if (hosted) return { kind: 'hosted', key: hosted.canonicalUrl };
  return null;
}

/**
 * Looks up rendition state for a batch of catalog media URLs in one query.
 * Empty input short-circuits without touching the database.
 */
export async function catalogMediaLadderLookup(
  mediaUrls: readonly string[],
): Promise<CatalogMediaLadder> {
  const fileIds = new Set<string>();
  const hostedUrls = new Set<string>();
  for (const raw of mediaUrls) {
    const ref = ladderKey(raw);
    if (!ref) continue;
    if (ref.kind === 'file') fileIds.add(ref.key);
    else hostedUrls.add(ref.key);
  }

  const rows = new Map<string, CatalogMediaLadderRow>();
  const ladder: CatalogMediaLadder = {
    get(mediaUrl: string) {
      const ref = ladderKey(mediaUrl);
      if (!ref) return undefined;
      const found = rows.get(ref.key);
      if (found) return found;
      return ref.kind === 'hosted' ? HOSTED_ABSENT : undefined;
    },
    get size() {
      return rows.size;
    },
  };
  if (fileIds.size === 0 && hostedUrls.size === 0) return ladder;

  const organizationId = getCurrentDbPrincipalOrganizationId();
  const conditions = [];
  if (fileIds.size > 0) {
    conditions.push(inArray(mediaFiles.id, [...fileIds]));
  }
  if (organizationId && hostedUrls.size > 0) {
    conditions.push(
      and(
        eq(mediaFiles.usagePurpose, 'hosted_video_preview'),
        eq(mediaFiles.organizationId, organizationId),
        inArray(mediaFiles.hostedVideoSourceUrl, [...hostedUrls]),
      ),
    );
  }
  if (conditions.length === 0) return ladder;

  const res = await getDrizzle()
    .select({
      id: mediaFiles.id,
      hostedVideoSourceUrl: mediaFiles.hostedVideoSourceUrl,
      previewSmKey: mediaFiles.previewSmKey,
      previewMdKey: mediaFiles.previewMdKey,
      previewStatus: mediaFiles.previewStatus,
      standardRenditionAt: mediaFiles.standardRenditionAt,
    })
    .from(mediaFiles)
    .where(or(...conditions));

  for (const row of res) {
    const id = row.id.toLowerCase();
    const key = row.hostedVideoSourceUrl?.trim() ? row.hostedVideoSourceUrl : id;
    rows.set(key, {
      previewSmUrl: row.previewSmKey?.trim() ? mediaPreviewUrlById(id, 'sm') : null,
      previewMdUrl: row.previewMdKey?.trim() ? mediaPreviewUrlById(id, 'md') : null,
      previewStatus: (row.previewStatus as MediaPreviewStatus | null) ?? 'pending',
      standardRendition: row.standardRenditionAt != null,
    });
  }
  return ladder;
}
