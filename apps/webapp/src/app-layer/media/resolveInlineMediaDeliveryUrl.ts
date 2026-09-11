import { getMediaRowForPlayback, getMediaS3KeyForRedirect } from './s3MediaStorage';
import { presignDeliveryGetUrl } from './s3DeliveryClient';
import { isHlsAssetReady } from '@/modules/media/playbackResolveDelivery';
import { parseVideoProcessingStatus } from '@/modules/media/videoHlsFields';
import { isTrustedHlsArtifactS3Key } from '@/shared/lib/hlsStorageLayout';

/**
 * One resolver for URLs placed into browser-facing list/detail payloads.
 * It can return only our standard image rendition or our same-origin HLS proxy. A raw key is not
 * an input to the signing capability, and types without an encoder output resolve to `null`.
 */
export async function resolveInlineMediaDeliveryUrl(
  mediaId: string | null,
  mimeType: string,
  expiresSec: number,
): Promise<string | null> {
  if (!mediaId) return null;
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime.startsWith('image/')) {
    const object = await getMediaS3KeyForRedirect(mediaId);
    return object
      ? presignDeliveryGetUrl(object.key, expiresSec, object.target, { mimeType: 'image/webp' })
      : null;
  }
  if (!normalizedMime.startsWith('video/')) return null;

  const row = await getMediaRowForPlayback(mediaId);
  if (!row) return null;
  const master = row.hls_master_playlist_s3_key?.trim() ?? '';
  if (
    !isHlsAssetReady(parseVideoProcessingStatus(row.video_processing_status), master) ||
    !isTrustedHlsArtifactS3Key(mediaId, master)
  ) {
    return null;
  }
  return `/api/media/${encodeURIComponent(mediaId)}/hls/master.m3u8`;
}
