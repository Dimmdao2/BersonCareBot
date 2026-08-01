import { resolvePlatformLfkMediaAccess } from '@/app-layer/media/resolvePlatformLfkMediaAccess';
import { getMediaAccessRow, type MediaAccessRow } from '@/app-layer/media/s3MediaStorage';
import { assertMediaPlaybackAccess } from '@/modules/media/assertMediaPlaybackAccess';
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
 * The one authorization door for HTTP delivery of a `media_files` object.
 *
 * The repository applies the active organization principal before this function sees a row.
 * Platform-library access is deliberately retried only after that organization-scoped lookup
 * misses and its explicit entitlement resolver grants access.
 */
export async function authorizeMediaDelivery(
  id: string,
  session: AppSession,
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

  return { ok: true, row, allowPlatformBase };
}
