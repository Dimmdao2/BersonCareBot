import sharp from 'sharp';

/**
 * Standard stored size for images (owner ruling 19.08.2026, SECURITY_CANON §5):
 * the upload is re-encoded to a bounded WebP and the original is dropped.
 *
 * Two things are bought by the same work:
 *  - storage: a 3 MB phone photo becomes a few hundred KB;
 *  - safety: re-encoding is the last remaining lever after the antivirus was declined —
 *    it destroys everything it does not understand (trailing payloads, hostile metadata)
 *    instead of trying to recognise it.
 *
 * Approved parameters: 1080 px on the SHORT side, WebP.
 *
 * Этот файл переехал сюда из `apps/webapp/src/modules/media/imageStandardRendition.ts`
 * 10.09.2026 (М7 плана `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`). Причина переезда — не
 * архитектурная опрятность: sharp/libvips разбирает присланные снаружи байты, и делал он это
 * внутри процесса, который держит пулы к базе, сессионный секрет и отвечает пациентам. Копии в
 * вебаппе НЕ остаётся: два энкодера с одними и теми же параметрами разъехались бы молча.
 */
export const STANDARD_IMAGE_SHORT_SIDE = 1080;
export const STANDARD_IMAGE_MIME = 'image/webp';

const WEBP_QUALITY = 82;
/** libwebp refuses either dimension above this; a panorama must be clamped by its long side. */
const WEBP_MAX_DIMENSION = 16383;

export type StandardImageRendition = {
  buffer: Buffer;
  mimeType: typeof STANDARD_IMAGE_MIME;
  width: number;
  height: number;
  animated: boolean;
};

/**
 * Target size for a source of `width` x `height` (already in display orientation).
 * Never enlarges: a source whose short side is below the target keeps its size.
 */
export function standardRenditionTargetSize(
  width: number,
  height: number,
): { width: number; height: number; scaled: boolean } {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  let scale = shortSide > STANDARD_IMAGE_SHORT_SIDE ? STANDARD_IMAGE_SHORT_SIDE / shortSide : 1;
  if (longSide * scale > WEBP_MAX_DIMENSION) {
    scale = WEBP_MAX_DIMENSION / longSide;
  }
  if (scale >= 1) {
    return { width, height, scaled: false };
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

/**
 * Re-encodes pixel data into the standard rendition. Nothing is copied through:
 * the output is produced by our encoder from decoded pixels.
 *
 * - EXIF (incl. GPS) is dropped — sharp writes no metadata unless asked to.
 * - Orientation is applied first via `.rotate()`, so a phone photo is not silently rotated.
 * - Animated sources (GIF, animated WebP) keep all frames as an animated WebP.
 * - Transparency survives: WebP carries an alpha channel.
 *
 * HEIC/HEIF is not decoded here — the caller converts it to a full-size JPEG through the
 * existing ffmpeg/ImageMagick path and feeds that JPEG in.
 */
export async function encodeStandardImageRendition(source: Buffer): Promise<StandardImageRendition> {
  const meta = await sharp(source).metadata();
  const animated = (meta.pages ?? 1) > 1;

  if (animated) {
    const pipeline = sharp(source, { animated: true });
    const width = meta.width ?? 0;
    const height = meta.pageHeight ?? meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error('standard_rendition_unknown_source_size');
    }
    const target = standardRenditionTargetSize(width, height);
    if (target.scaled) {
      pipeline.resize(target.width, target.height, { fit: 'inside' });
    }
    const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    const out = await sharp(buffer, { animated: true }).metadata();
    return {
      buffer,
      mimeType: STANDARD_IMAGE_MIME,
      width: out.width ?? target.width,
      height: out.pageHeight ?? out.height ?? target.height,
      animated: true,
    };
  }

  // `autoOrient` reports the size as displayed; `width`/`height` are pre-rotation.
  const displayed = meta.autoOrient ?? { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!displayed.width || !displayed.height) {
    throw new Error('standard_rendition_unknown_source_size');
  }
  const target = standardRenditionTargetSize(displayed.width, displayed.height);
  const pipeline = sharp(source).rotate();
  if (target.scaled) {
    pipeline.resize(target.width, target.height, { fit: 'inside' });
  }
  const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    mimeType: STANDARD_IMAGE_MIME,
    width: out.width ?? target.width,
    height: out.height ?? target.height,
    animated: false,
  };
}

/** Thumbnails are derived from our own re-encoded output, never from the raw upload. */
export async function thumbnailsSmMd(raw: Buffer): Promise<{ sm: Buffer; md: Buffer }> {
  const sm = await sharp(raw)
    .rotate()
    .resize(160, 160, { fit: 'inside' })
    .jpeg({ quality: 82 })
    .toBuffer();
  const md = await sharp(raw)
    .rotate()
    .resize(400, 400, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { sm, md };
}

/** Размеры кадра, снятого ffmpeg: постер полноразмерный, поэтому это и есть размер видео. */
export async function imageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number } | null> {
  const meta = await sharp(buffer).metadata();
  const displayed = meta.autoOrient ?? { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!displayed.width || !displayed.height) return null;
  return { width: displayed.width, height: displayed.height };
}
