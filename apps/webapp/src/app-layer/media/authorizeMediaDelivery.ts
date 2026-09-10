import { resolvePlatformLfkMediaAccess } from '@/app-layer/media/resolvePlatformLfkMediaAccess';
import { getMediaAccessRow, type MediaAccessRow } from '@/app-layer/media/s3MediaStorage';
import { assertMediaPlaybackAccess } from '@/modules/media/assertMediaPlaybackAccess';
import { isRawOriginalUploader } from '@/modules/media/rawOriginalDownloadRule';
import type { AppSession } from '@/shared/types/session';

export type MediaDeliveryAccess =
  | {
      ok: true;
      row: MediaAccessRow;
      allowPlatformBase: boolean;
    }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden';
    };

/**
 * Что именно просят у двери.
 *
 * `playback` — обычная выдача: превью, прогрессивный объект, HLS. Байты, которые доехали до
 * браузера, — это вывод нашего энкодера.
 *
 * `raw_original` — скачивание того самого файла, который человек загрузил (М6,
 * `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`). Владелец 10.09.2026 дословно: «исходник отдаём, и,
 * естественно, только тому специалисту, который это загрузил». Поэтому поверх организационной
 * стены здесь стоит ещё одно условие — совпадение с `media_files.uploaded_by`.
 */
export type MediaDeliveryIntent = 'playback' | 'raw_original';

/**
 * The one authorization door for HTTP delivery of a `media_files` object.
 *
 * The repository applies the active organization principal before this function sees a row.
 * Platform-library access is deliberately retried only after that organization-scoped lookup
 * misses and its explicit entitlement resolver grants access.
 */
export async function authorizeMediaDelivery(
  id: string,
  session: AppSession,
  options: { intent?: MediaDeliveryIntent } = {},
): Promise<MediaDeliveryAccess> {
  let allowPlatformBase = false;
  let row = await getMediaAccessRow(id);
  if (!row) {
    allowPlatformBase = await resolvePlatformLfkMediaAccess(id);
    if (allowPlatformBase) row = await getMediaAccessRow(id, { allowPlatformBase: true });
  }
  if (!row) return { ok: false, reason: 'not_found' };

  if (
    !assertMediaPlaybackAccess(session, {
      usagePurpose: row.usage_purpose,
      uploadedBy: row.uploaded_by,
    })
  ) {
    return { ok: false, reason: 'forbidden' };
  }

  if (options.intent === 'raw_original') {
    /*
     * Файл платформенной библиотеки загружали не в этой организации — «тот, кто загрузил» тут
     * не определён, и сырые байты чужой загрузки наружу не идут.
     */
    if (allowPlatformBase) return { ok: false, reason: 'forbidden' };
    if (
      !isRawOriginalUploader({
        uploadedBy: row.uploaded_by,
        requesterUserId: session.user.userId,
      })
    ) {
      return { ok: false, reason: 'forbidden' };
    }
  }

  return { ok: true, row, allowPlatformBase };
}
