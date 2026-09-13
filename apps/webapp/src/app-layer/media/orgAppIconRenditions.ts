import { logger } from '@/app-layer/logging/logger';
import { getOrgAppIconRenditionSource } from '@/app-layer/media/s3MediaStorage';
import { s3HeadObject, s3PutObjectBody } from '@/app-layer/media/s3Client';
import { deliveryGetPrivateObjectBuffer } from '@/app-layer/media/s3DeliveryClient';
import {
  encodeOrgAppIconRenditions,
  OrgAppIconSourceRejected,
} from '@/modules/media/orgAppIconRenditions';
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
 * ВХОД — НАШ СОБСТВЕННЫЙ ВЫВОД, НЕ ЗАГРУЖЕННЫЙ ФАЙЛ (коррекция 14.09.2026 по правилу владельца:
 * «сырой исходник мы не трогаем в бою вообще… нет конвертации — ждём и видим, что файл
 * готовится»). Размеры режутся из `media/<id>/standard.webp`, который сделал изолированный
 * медиа-воркер, и читаются hot-only способностью `deliveryGetPrivateObjectBuffer` через её
 * app-layer порт `s3DeliveryClient` (второй и последний порт над `infra/s3`, гейт
 * `check-media-upload-door.mjs` держит это в одном файле): сырой бакет из этого модуля недостижим
 * по построению — `StorageKind` через сигнатуру способности не передать.
 *
 * До 14.09.2026 здесь стояло обратное: `getMediaOriginalObjectForDownload` тянул сырые байты из
 * холодного бакета в память процесса вебаппа и отдавал их `sharp`. Так чинили «у свежей иконки
 * рендишна ещё нет, обычная выдача вернёт null» — и тем самым вернули в Next.js разбор чужих байт,
 * ради прекращения которого сделан отдельный воркер (М7). Правильный ответ на то же «ещё нет» —
 * `source_processing`: врач видит «картинка готовится» и сохраняет снова.
 */

const RENDITION_MIME = 'image/png';

export type OrgAppIconRenditionOutcome =
  | { ok: true; keys: string[] }
  | {
      ok: false;
      reason:
        | 'source_unavailable'
        | 'source_processing'
        | 'source_too_small'
        | 'source_too_large'
        | 'encode_failed'
        | 'store_failed';
    };

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
  const found = await getOrgAppIconRenditionSource(mediaId);
  if (found.status === 'missing') return { ok: false, reason: 'source_unavailable' };
  if (found.status === 'processing') return { ok: false, reason: 'source_processing' };
  const source = await deliveryGetPrivateObjectBuffer(found.object.key, found.object.target);
  if (!source.ok) return { ok: false, reason: 'source_unavailable' };

  let renditions;
  try {
    renditions = await encodeOrgAppIconRenditions(mediaId, source.buf);
  } catch (err) {
    // Негодный размер — не сбой переформатирования, а отказ по материалу: у него своя причина,
    // чтобы врач прочитал «слишком маленькая картинка», а не «не удалось».
    if (err instanceof OrgAppIconSourceRejected) {
      logger.info(
        {
          scope: 'org_app_icon',
          event: 'org_app_icon_source_rejected',
          mediaId,
          reason: err.reason,
        },
        '[org-app-icon] source rejected',
      );
      return { ok: false, reason: err.reason };
    }
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
