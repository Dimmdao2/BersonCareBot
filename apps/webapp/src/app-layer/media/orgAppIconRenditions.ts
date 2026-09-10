import { logger } from '@/app-layer/logging/logger';
import { getMediaS3KeyForRedirect } from '@/app-layer/media/s3MediaStorage';
import {
  s3GetPrivateObjectBuffer,
  s3HeadObject,
  s3PutObjectBody,
} from '@/app-layer/media/s3Client';
import { encodeOrgAppIconRenditions } from '@/modules/media/orgAppIconRenditions';
import {
  ORG_APP_ICON_VARIANTS,
  orgAppIconObjectKey,
} from '@/shared/lib/brand/orgAppIcon';

/**
 * Запись готовых размеров иконки клиники в объектное хранилище (владелец 10.09.2026, вариант A).
 *
 * Почему деривативы всегда ложатся в `library`, а не туда, где лежит исходник: иконка клиники —
 * ПУБЛИЧНАЯ картинка, её отдаёт дверь без сессии. Пациентское хранилище существует ради серверного
 * шифрования файлов пациентов (решение владельца 06.09.2026), и складывать в него объекты, которые
 * мы сами раздаём анониму, значит размывать смысл разделения. Фиксированная цель к тому же
 * позволяет двери выдачи не спрашивать БД вообще: адрес полностью задаёт ключ.
 *
 * Вызывается из пути сохранения бренда, где принципал — сотрудник СВОЕЙ организации, поэтому
 * исходник читается org-scoped запросом `getMediaS3KeyForRedirect` и подсунуть чужой файл нечем.
 */

const RENDITION_MIME = 'image/png';

export type OrgAppIconRenditionOutcome =
  | { ok: true; keys: string[] }
  | { ok: false; reason: 'source_unavailable' | 'encode_failed' | 'store_failed' };

/**
 * Готовые размеры неизменяемы для своего media id — смена иконки означает другой id, — поэтому
 * повторное сохранение бренда не пересчитывает то же самое. Проверяется ПОСЛЕДНИЙ по порядку
 * записи вариант: если он на месте, значит цикл записи дошёл до конца, а если предыдущая попытка
 * оборвалась на середине, работа честно повторится.
 */
async function renditionsAlreadyStored(mediaId: string): Promise<boolean> {
  const last = ORG_APP_ICON_VARIANTS[ORG_APP_ICON_VARIANTS.length - 1]!;
  try {
    return await s3HeadObject(orgAppIconObjectKey(mediaId, last), 'library');
  } catch {
    return false;
  }
}

export async function writeOrgAppIconRenditions(
  mediaId: string,
): Promise<OrgAppIconRenditionOutcome> {
  if (await renditionsAlreadyStored(mediaId)) {
    return {
      ok: true,
      keys: ORG_APP_ICON_VARIANTS.map((variant) => orgAppIconObjectKey(mediaId, variant)),
    };
  }
  const object = await getMediaS3KeyForRedirect(mediaId);
  if (!object) return { ok: false, reason: 'source_unavailable' };
  const source = await s3GetPrivateObjectBuffer(object.key, object.target);
  if (!source.ok) return { ok: false, reason: 'source_unavailable' };

  let renditions;
  try {
    renditions = await encodeOrgAppIconRenditions(mediaId, source.buf);
  } catch (err) {
    logger.warn(
      {
        scope: 'org_app_icon',
        event: 'org_app_icon_encode_failed',
        mediaId,
        error: err instanceof Error ? err.message : String(err),
      },
      '[org-app-icon] encode failed',
    );
    return { ok: false, reason: 'encode_failed' };
  }

  try {
    for (const rendition of renditions) {
      await s3PutObjectBody(rendition.key, rendition.buffer, RENDITION_MIME, 'library');
    }
  } catch (err) {
    logger.error(
      {
        scope: 'org_app_icon',
        event: 'org_app_icon_store_failed',
        mediaId,
        error: err instanceof Error ? err.message : String(err),
      },
      '[org-app-icon] store failed',
    );
    return { ok: false, reason: 'store_failed' };
  }
  return { ok: true, keys: renditions.map((rendition) => rendition.key) };
}
