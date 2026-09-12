import { getMediaRowForPlayback, getMediaS3KeyForRedirect } from './s3MediaStorage';
import { presignDeliveryGetUrl } from './s3DeliveryClient';
import { isHlsAssetReady } from '@/modules/media/playbackResolveDelivery';
import { parseVideoProcessingStatus } from '@/modules/media/videoHlsFields';
import { isTrustedHlsArtifactS3Key } from '@/shared/lib/hlsStorageLayout';
import { encoderOutputFor } from '@/shared/lib/mediaEncoderOutput';

/**
 * One resolver for URLs placed into browser-facing list/detail payloads.
 *
 * Сырой ключ не входит в подпись ни при каком типе — способность подписи физически читает только
 * горячий бакет. Различает типы то, что наш энкодер для них производит (`encoderOutputFor`):
 * картинка — свой стандартный рендишн, видео — свой HLS-прокси, а документ и аудио получают сам
 * загруженный объект, потому что нашей версии у них не бывает и ждать нечего. Тип и имя файла идут
 * в подпись вместе со ссылкой: дисположение решаем мы, а не хранилище, поэтому PDF уходит
 * вложением, а аудио играет.
 */
export async function resolveInlineMediaDeliveryUrl(
  mediaId: string | null,
  mimeType: string,
  expiresSec: number,
  filename?: string | null,
): Promise<string | null> {
  if (!mediaId) return null;
  const output = encoderOutputFor(mimeType);
  if (output === 'standard_image') {
    const object = await getMediaS3KeyForRedirect(mediaId);
    return object
      ? presignDeliveryGetUrl(object.key, expiresSec, object.target, { mimeType: 'image/webp' })
      : null;
  }
  if (output === 'none') {
    const object = await getMediaS3KeyForRedirect(mediaId);
    return object
      ? presignDeliveryGetUrl(object.key, expiresSec, object.target, {
          mimeType,
          ...(filename ? { filename } : {}),
        })
      : null;
  }

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
