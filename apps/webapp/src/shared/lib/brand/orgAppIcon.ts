/**
 * Словарь готовых размеров иконки клиники: имена вариантов, ключи в объектном хранилище и
 * публичные адреса. Поручение владельца 10.09.2026: «иконка брендированного приложения и сайта
 * пациента должна настраиваться в кабинете доктора, она же и на фавикон должна ставиться (в идеале
 * сразу при установке или смене и переформатируется под фавикон и все остальные форматы)».
 *
 * Живёт в `shared/lib`, потому что словарь называют ТРИ края и ни один из них не главнее:
 * набор иконок поверхности (`shared/lib/pwa/patientPwaManifest`), генератор деривативов
 * (`modules/media/orgAppIconRenditions`) и публичная дверь выдачи
 * (`app/api/brand/app-icon/[mediaId]/[variant]`). Один словарь — значит адрес, ключ и картинка
 * не могут разъехаться.
 *
 * Набор размеров дословно повторяет платформенный (`apps/mobile-shell/scripts/derive-brand-assets.mjs`
 * + `public/therapygo-*`): 32 — фавикон вкладки, 180 — apple-touch, 192 и 512 — установленное
 * приложение, maskable-512 — адаптивная иконка Android с безопасной зоной. Ничего лишнего:
 * каждый размер отвечает на существующее требование `<head>` или манифеста.
 */

export const ORG_APP_ICON_VARIANTS = ['32', '180', '192', '512', 'maskable-512'] as const;
export type OrgAppIconVariant = (typeof ORG_APP_ICON_VARIANTS)[number];

/** Сторона квадрата варианта в пикселях. `maskable-512` — те же 512 с безопасной зоной внутри. */
export const ORG_APP_ICON_VARIANT_SIZE: Record<OrgAppIconVariant, number> = {
  '32': 32,
  '180': 180,
  '192': 192,
  '512': 512,
  'maskable-512': 512,
};

const MEDIA_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Префикс деривативов клиники в объектном хранилище; исходник лежит отдельно, как медиа-файл. */
export function orgAppIconObjectKey(mediaId: string, variant: OrgAppIconVariant): string {
  if (!MEDIA_ID_RE.test(mediaId)) throw new Error('org_app_icon_media_id_invalid');
  return `org-app-icons/${mediaId}/${variant}.png`;
}

/**
 * Публичный адрес размера. Media id в пути — это и версия: смена иконки меняет id, значит меняет
 * адрес, поэтому ответ можно кэшировать навсегда и не выдавать пациенту вчерашний фавикон.
 */
export function orgAppIconUrl(mediaId: string, variant: OrgAppIconVariant): string {
  if (!MEDIA_ID_RE.test(mediaId)) throw new Error('org_app_icon_media_id_invalid');
  return `/api/brand/app-icon/${mediaId}/${variant}.png`;
}

/** Разбор сегмента маршрута `<variant>.png` обратно в вариант; всё прочее — не наш адрес. */
export function parseOrgAppIconVariantSegment(segment: string): OrgAppIconVariant | null {
  if (!segment.endsWith('.png')) return null;
  const candidate = segment.slice(0, -'.png'.length);
  return (ORG_APP_ICON_VARIANTS as readonly string[]).includes(candidate)
    ? (candidate as OrgAppIconVariant)
    : null;
}

/** Валидный ли media id иконки; та же проверка, что и на границе поверхности. */
export function isOrgAppIconMediaId(value: string): boolean {
  return MEDIA_ID_RE.test(value);
}

/**
 * Границы исходника (владелец 10.09.2026: «слишком маленький исходник как и слишком большой —
 * отклонять… просто не давать загрузить»).
 *
 * Считаем по ДЛИННОЙ стороне, потому что именно она задаёт масштаб при `fit: 'contain'`:
 * длинная сторона ≥ 512 — значит самый большой вариант (512×512) собирается без растягивания,
 * то есть иконка не будет мыльной. Ниже — растягивание неизбежно, и лучше сказать врачу сразу,
 * чем показать пациенту размытый фавикон.
 *
 * Верхняя граница — про материал, а не про диск: 4096 px по длинной стороне это ещё иконка/логотип,
 * а всё, что больше, — фотография не по адресу (и лишние минуты загрузки на телефоне врача).
 */
export const ORG_APP_ICON_MIN_SOURCE_SIDE = 512;
export const ORG_APP_ICON_MAX_SOURCE_SIDE = 4096;

export type OrgAppIconSourceRejection = 'source_too_small' | 'source_too_large';

/**
 * Отказ по размеру исходника или `null`, если размер подходит. Неизвестный размер (`null`) —
 * НЕ отказ: клиент не всегда может измерить файл, и последнее слово остаётся за сервером,
 * который читает уже сохранённые байты.
 *
 * Одна функция обслуживает все три места, где это спрашивают: выбор файла в кабинете доктора,
 * выбор готового файла из библиотеки и переформатирование на сервере.
 */
export function orgAppIconSourceRejection(
  size: { width: number; height: number } | null,
): OrgAppIconSourceRejection | null {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
  if (size.width <= 0 || size.height <= 0) return null;
  const longSide = Math.max(size.width, size.height);
  if (longSide < ORG_APP_ICON_MIN_SOURCE_SIDE) return 'source_too_small';
  if (longSide > ORG_APP_ICON_MAX_SOURCE_SIDE) return 'source_too_large';
  return null;
}

/** Единая формулировка отказа: врач читает одно и то же и в диалоге выбора, и при сохранении. */
export function orgAppIconSourceRejectionMessage(reason: OrgAppIconSourceRejection): string {
  return reason === 'source_too_small'
    ? `Картинка слишком маленькая для иконки приложения: нужна сторона не меньше ${ORG_APP_ICON_MIN_SOURCE_SIDE} px (иконка собирается в размере 512×512).`
    : `Картинка слишком большая для иконки приложения: сторона не больше ${ORG_APP_ICON_MAX_SOURCE_SIDE} px. Уменьшите файл и загрузите снова.`;
}
