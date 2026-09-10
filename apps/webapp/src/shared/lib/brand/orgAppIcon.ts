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
