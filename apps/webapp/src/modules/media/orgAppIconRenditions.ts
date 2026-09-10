import sharp from 'sharp';
import {
  ORG_APP_ICON_VARIANTS,
  ORG_APP_ICON_VARIANT_SIZE,
  orgAppIconObjectKey,
  type OrgAppIconVariant,
} from '@/shared/lib/brand/orgAppIcon';

/**
 * Переформатирование загруженной иконки клиники во все нужные форматы (владелец 10.09.2026:
 * «в идеале сразу при установке или смене и переформатируется под фавикон и все остальные форматы»).
 *
 * Делается ОДИН раз при сохранении, а не на каждый запрос: фавикон и иконки манифеста браузер
 * просит на каждой холодной загрузке, и гнать через sharp 512×512 в запросе пациента — это то самое
 * «грузятся долго», которое владелец уже отдельно запрещал по иконкам кабинета.
 *
 * Два решения внутри, оба следуют платформенному генератору
 * (`apps/mobile-shell/scripts/derive-brand-assets.mjs`), чтобы иконка клиники и иконка платформы
 * выглядели одинаково аккуратно:
 *
 *  1. Все варианты, кроме maskable, — это `fit: 'contain'` на прозрачном фоне. Клиника присылает
 *     квадрат, но присылает и не квадрат тоже; `cover` обрезал бы логотип по краям (та же ошибка,
 *     которая портила эмодзи самочувствия), а `contain` вписывает целиком.
 *  2. `maskable-512` — тот же рисунок в безопасной зоне 66% на непрозрачном белом фоне. Android
 *     вырезает из maskable-иконки круг/скруглённый квадрат: рисунок «в край» он срежет, а
 *     прозрачный фон покажет чёрным. Белый совпадает с `background_color` манифеста.
 */

/** Доля стороны, которую занимает рисунок внутри maskable-иконки (безопасная зона Android). */
const MASKABLE_CONTENT_RATIO = 0.66;
const MASKABLE_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 } as const;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export type OrgAppIconRendition = {
  variant: OrgAppIconVariant;
  key: string;
  buffer: Buffer;
};

async function encodeVariant(
  source: Buffer,
  variant: OrgAppIconVariant,
): Promise<Buffer> {
  const size = ORG_APP_ICON_VARIANT_SIZE[variant];
  if (variant !== 'maskable-512') {
    return sharp(source)
      .rotate()
      .resize(size, size, { fit: 'contain', background: TRANSPARENT })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
  }
  const content = Math.round(size * MASKABLE_CONTENT_RATIO);
  const pad = Math.round((size - content) / 2);
  const inner = await sharp(source)
    .rotate()
    .resize(content, content, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: MASKABLE_BACKGROUND,
    },
  })
    .composite([{ input: inner, top: pad, left: pad }])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

/**
 * Все варианты одной иконки. Ничего не пишет — возвращает готовые байты и их ключи, чтобы запись
 * в хранилище оставалась решением вызывающего слоя (та же дисциплина, что у
 * `buildImageStandardRendition`).
 */
export async function encodeOrgAppIconRenditions(
  mediaId: string,
  source: Buffer,
): Promise<OrgAppIconRendition[]> {
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('org_app_icon_source_size_unknown');
  }
  const renditions: OrgAppIconRendition[] = [];
  for (const variant of ORG_APP_ICON_VARIANTS) {
    renditions.push({
      variant,
      key: orgAppIconObjectKey(mediaId, variant),
      buffer: await encodeVariant(source, variant),
    });
  }
  return renditions;
}
