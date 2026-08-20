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

export type ImageStandardRenditionDeps = {
  encode: (source: Buffer) => Promise<StandardImageRendition>;
  putObject: (key: string, body: Buffer, mimeType: string) => Promise<void>;
  headObject: (key: string) => Promise<boolean>;
  thumbnails: (source: Buffer) => Promise<{ sm: Buffer; md: Buffer }>;
};

export type ImageStandardRenditionOutcome = {
  standardKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  smKey: string;
  mdKey: string;
  /** Key of the upload that the rendition replaces; the caller deletes it AFTER the row is committed. */
  supersededOriginalKey: string | null;
};

/**
 * Writes the standard rendition and its thumbnails, and reports which upload it replaces.
 *
 * Deliberately does NOT delete anything. Ordering is the whole point: the original may only be
 * dropped once the rendition is durably stored AND the row points at it, and the row is committed
 * by the caller's transaction. Every failure below therefore leaves the original untouched.
 */
export async function buildImageStandardRendition(
  params: {
    originalKey: string;
    standardKey: string;
    smKey: string;
    mdKey: string;
    source: Buffer;
  },
  deps: ImageStandardRenditionDeps,
): Promise<ImageStandardRenditionOutcome> {
  const rendition = await deps.encode(params.source);
  await deps.putObject(params.standardKey, rendition.buffer, rendition.mimeType);
  const stored = await deps.headObject(params.standardKey);
  if (!stored) {
    throw new Error('standard_rendition_head_missing_after_upload');
  }
  const { sm, md } = await deps.thumbnails(rendition.buffer);
  await deps.putObject(params.smKey, sm, 'image/jpeg');
  await deps.putObject(params.mdKey, md, 'image/jpeg');
  return {
    standardKey: params.standardKey,
    mimeType: rendition.mimeType,
    sizeBytes: rendition.buffer.byteLength,
    width: rendition.width,
    height: rendition.height,
    smKey: params.smKey,
    mdKey: params.mdKey,
    supersededOriginalKey:
      params.originalKey && params.originalKey !== params.standardKey ? params.originalKey : null,
  };
}
