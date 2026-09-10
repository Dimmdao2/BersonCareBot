import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  ORG_APP_ICON_VARIANTS,
  parseOrgAppIconVariantSegment,
} from '@/shared/lib/brand/orgAppIcon';
import { encodeOrgAppIconRenditions } from './orgAppIconRenditions';

const MEDIA_ID = '5f6e7d8c-9a0b-4c1d-8e2f-3a4b5c6d7e8f';

/** Неквадратный прозрачный источник — самый вредный случай: именно его нельзя обрезать. */
async function wideTransparentSource(): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 200, channels: 4, background: { r: 0, g: 90, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('переформатирование иконки клиники', () => {
  it('даёт все объявленные форматы ровно нужного размера и в PNG', async () => {
    const renditions = await encodeOrgAppIconRenditions(MEDIA_ID, await wideTransparentSource());

    expect(renditions.map((rendition) => rendition.variant)).toEqual([...ORG_APP_ICON_VARIANTS]);
    for (const rendition of renditions) {
      const meta = await sharp(rendition.buffer).metadata();
      expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({
        format: 'png',
        width: meta.width,
        height: meta.width,
      });
      expect(rendition.key).toBe(`org-app-icons/${MEDIA_ID}/${rendition.variant}.png`);
    }
    expect((await sharp(renditions[0]!.buffer).metadata()).width).toBe(32);
  });

  it('широкий логотип вписывается целиком, а не обрезается по краям', async () => {
    const renditions = await encodeOrgAppIconRenditions(MEDIA_ID, await wideTransparentSource());
    const icon512 = renditions.find((rendition) => rendition.variant === '512')!;
    const { data, info } = await sharp(icon512.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Источник 600×200 вписан в квадрат: центр непрозрачен, верхний край остаётся пустым полем.
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3]!;
    expect(at(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBeGreaterThan(0);
    expect(at(Math.floor(info.width / 2), 1)).toBe(0);
  });

  it('maskable-иконка непрозрачна и держит рисунок в безопасной зоне', async () => {
    const renditions = await encodeOrgAppIconRenditions(MEDIA_ID, await wideTransparentSource());
    const maskable = renditions.find((rendition) => rendition.variant === 'maskable-512')!;
    const { data, info } = await sharp(maskable.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]!, a: data[offset + 3]! };
    };
    // Угол — белый фон, а не прозрачность: Android показал бы прозрачное чёрным.
    expect(pixel(2, 2)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixel(Math.floor(info.width / 2), Math.floor(info.height / 2)).b).toBeGreaterThan(100);
  });

  it('чужой сегмент адреса не превращается в вариант', () => {
    expect(parseOrgAppIconVariantSegment('192.png')).toBe('192');
    expect(parseOrgAppIconVariantSegment('maskable-512.png')).toBe('maskable-512');
    expect(parseOrgAppIconVariantSegment('192')).toBeNull();
    expect(parseOrgAppIconVariantSegment('1024.png')).toBeNull();
    expect(parseOrgAppIconVariantSegment('../../secret.png')).toBeNull();
  });
});
