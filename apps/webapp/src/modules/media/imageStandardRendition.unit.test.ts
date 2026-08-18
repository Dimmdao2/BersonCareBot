import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  STANDARD_IMAGE_SHORT_SIDE,
  buildImageStandardRendition,
  encodeStandardImageRendition,
  type ImageStandardRenditionDeps,
} from './imageStandardRendition';

const solid = (width: number, height: number, r: number, g: number, b: number) =>
  sharp({ create: { width, height, channels: 3, background: { r, g, b } } });

async function halvesJpeg(width: number, height: number): Promise<Buffer> {
  // Left half red, right half blue — makes an unapplied rotation visible in the pixels.
  const left = await solid(width / 2, height, 255, 0, 0).png().toBuffer();
  const right = await solid(width / 2, height, 0, 0, 255).png().toBuffer();
  return solid(width, height, 0, 0, 0)
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: width / 2, top: 0 },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number) {
  const { data } = await sharp(buffer)
    .extract({ left: x, top: y, width: 8, height: 8 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

describe('encodeStandardImageRendition', () => {
  it('shrinks an oversize photo to 1080 on the short side and re-encodes it as WebP', async () => {
    const source = await solid(4032, 3024, 40, 120, 200).jpeg({ quality: 92 }).toBuffer();

    const rendition = await encodeStandardImageRendition(source);

    expect(rendition.mimeType).toBe('image/webp');
    expect(Math.min(rendition.width, rendition.height)).toBeLessThanOrEqual(
      STANDARD_IMAGE_SHORT_SIDE,
    );
    expect(rendition.height).toBe(1080);
    expect(rendition.width).toBe(1440);
    const stored = await sharp(rendition.buffer).metadata();
    expect(stored.format).toBe('webp');
    expect(rendition.buffer.byteLength).toBeLessThan(source.byteLength);
  });

  it('does not enlarge an image that is already below the standard size', async () => {
    const source = await solid(300, 200, 10, 20, 30).png().toBuffer();

    const rendition = await encodeStandardImageRendition(source);

    expect(rendition.width).toBe(300);
    expect(rendition.height).toBe(200);
  });

  it('applies EXIF orientation and stores no metadata', async () => {
    // 1600x1200 landscape tagged orientation=6 (rotate 90° CW) — displayed as 1200x1600 portrait.
    const source = await sharp(await halvesJpeg(1600, 1200))
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const rendition = await encodeStandardImageRendition(source);

    // Rotated: portrait, not landscape.
    expect(rendition.width).toBe(1080);
    expect(rendition.height).toBe(1440);
    // The red left half of the raw frame must end up along the top edge.
    const top = await pixelAt(rendition.buffer, 500, 20);
    expect(top.r).toBeGreaterThan(200);
    expect(top.b).toBeLessThan(80);

    const stored = await sharp(rendition.buffer).metadata();
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
  });

  it('keeps every frame of an animated GIF', async () => {
    const frames = await Promise.all([
      solid(2400, 1600, 255, 0, 0).png().toBuffer(),
      solid(2400, 1600, 0, 255, 0).png().toBuffer(),
      solid(2400, 1600, 0, 0, 255).png().toBuffer(),
    ]);
    const source = await sharp(frames, { join: { animated: true } }).gif().toBuffer();

    const rendition = await encodeStandardImageRendition(source);

    expect(rendition.animated).toBe(true);
    expect(rendition.height).toBe(1080);
    const stored = await sharp(rendition.buffer, { animated: true }).metadata();
    expect(stored.pages).toBe(3);
    expect(stored.format).toBe('webp');
  });

  it('keeps transparency of a PNG', async () => {
    const source = await sharp({
      create: { width: 2000, height: 1500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const rendition = await encodeStandardImageRendition(source);

    expect((await sharp(rendition.buffer).metadata()).hasAlpha).toBe(true);
  });
});

describe('buildImageStandardRendition', () => {
  const source = Buffer.from('source-bytes');
  const params = {
    originalKey: 'media/id/photo.jpg',
    standardKey: 'media/id/standard.webp',
    smKey: 'previews/sm/id.jpg',
    mdKey: 'previews/md/id.jpg',
    source,
  };

  function deps(overrides: Partial<ImageStandardRenditionDeps> = {}): ImageStandardRenditionDeps {
    return {
      encode: async () => ({
        buffer: Buffer.from('webp-bytes'),
        mimeType: 'image/webp' as const,
        width: 1440,
        height: 1080,
        animated: false,
      }),
      putObject: async () => {},
      headObject: async () => true,
      thumbnails: async () => ({ sm: Buffer.from('sm'), md: Buffer.from('md') }),
      ...overrides,
    };
  }

  it('reports the raw upload as superseded only after rendition and thumbnails are stored', async () => {
    const puts: string[] = [];
    const outcome = await buildImageStandardRendition(params, {
      ...deps(),
      putObject: async (key) => {
        puts.push(key);
      },
    });

    expect(puts).toEqual([params.standardKey, params.smKey, params.mdKey]);
    expect(outcome.supersededOriginalKey).toBe(params.originalKey);
    expect(outcome.mimeType).toBe('image/webp');
    expect(outcome.sizeBytes).toBe(Buffer.from('webp-bytes').byteLength);
  });

  it('writes nothing and supersedes nothing when the re-encode fails', async () => {
    const puts: string[] = [];
    const deleted: string[] = [];

    await expect(
      buildImageStandardRendition(params, {
        ...deps(),
        encode: async () => {
          throw new Error('Input buffer contains unsupported image format');
        },
        putObject: async (key) => {
          puts.push(key);
        },
      }).then((outcome) => {
        if (outcome.supersededOriginalKey) deleted.push(outcome.supersededOriginalKey);
      }),
    ).rejects.toThrow('unsupported image format');

    expect(puts).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('supersedes nothing when the stored rendition cannot be read back', async () => {
    const deleted: string[] = [];

    await expect(
      buildImageStandardRendition(params, { ...deps(), headObject: async () => false }).then(
        (outcome) => {
          if (outcome.supersededOriginalKey) deleted.push(outcome.supersededOriginalKey);
        },
      ),
    ).rejects.toThrow('standard_rendition_head_missing_after_upload');

    expect(deleted).toEqual([]);
  });

  it('never supersedes the rendition itself on a repeated run', async () => {
    const outcome = await buildImageStandardRendition(
      { ...params, originalKey: params.standardKey },
      deps(),
    );

    expect(outcome.supersededOriginalKey).toBeNull();
  });
});
