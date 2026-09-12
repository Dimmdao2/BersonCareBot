import { describe, expect, it } from 'vitest';
import {
  HOSTED_PREVIEW_RETRY,
  HOSTED_PREVIEW_UNAVAILABLE,
  MAX_IMAGE_PREVIEW_BYTES,
  backoffMinutesAfterFailure,
  isPermanentPreviewError,
  planMediaPreview,
} from './mediaPreviewPlan';

/**
 * Решение «что делать со строкой» осталось в вебаппе, а разбор байт уехал в media-worker. Здесь
 * проверяется именно решение: воркер получает наряд ровно на то, что он умеет, и ни одна ветка не
 * отдаёт ему файл, которому превью не положено.
 */

const base = {
  mimeType: 'image/jpeg',
  sizeBytes: 2_000_000,
  s3Key: 'media/raw/photo.jpg',
  usagePurpose: null,
  hostedVideoSourceUrl: null,
};

describe('planMediaPreview', () => {
  it('sends an ordinary image to the encoder with the key it is stored under', () => {
    expect(planMediaPreview(base)).toEqual({ kind: 'image', sourceKey: 'media/raw/photo.jpg' });
  });

  it('sends video to the poster path, not to the image encoder', () => {
    expect(planMediaPreview({ ...base, mimeType: 'video/mp4', s3Key: 'media/raw/clip.mp4' })).toEqual({
      kind: 'video_poster',
      sourceKey: 'media/raw/clip.mp4',
    });
  });

  /*
   * Порядок веток: HEIC проверяется ДО потолка обычной картинки. Иначе снимок с телефона между
   * 50 МБ и потолком загрузки молча стал бы `skipped` вместо разбора через ffmpeg.
   */
  it('keeps a large HEIC on the ffmpeg path instead of dropping it by the image ceiling', () => {
    expect(
      planMediaPreview({
        ...base,
        mimeType: 'image/heic',
        sizeBytes: MAX_IMAGE_PREVIEW_BYTES + 1,
        s3Key: 'media/raw/photo.heic',
      }),
    ).toEqual({ kind: 'heic', sourceKey: 'media/raw/photo.heic' });
  });

  it('refuses to hand the worker an image too large to hold in memory', () => {
    expect(
      planMediaPreview({ ...base, sizeBytes: MAX_IMAGE_PREVIEW_BYTES + 1 }),
    ).toEqual({ kind: 'skip', reason: 'image_too_large' });
  });

  it('gives no preview order for a file no decoder of ours understands', () => {
    expect(planMediaPreview({ ...base, mimeType: 'application/pdf' })).toEqual({
      kind: 'skip',
      reason: 'unsupported_mime',
    });
  });

  it('routes a hosted cover through the seam only while the row has no object of its own', () => {
    const hosted = {
      ...base,
      s3Key: null,
      usagePurpose: 'hosted_video_preview',
      hostedVideoSourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    };
    expect(planMediaPreview(hosted)).toEqual({ kind: 'hosted_thumbnail' });
    /* Обложка уже скачана и лежит у нас — дальше это обычная картинка, а не поход к провайдеру. */
    expect(planMediaPreview({ ...hosted, s3Key: 'media/raw/cover.jpg' })).toEqual({
      kind: 'image',
      sourceKey: 'media/raw/cover.jpg',
    });
  });
});

describe('isPermanentPreviewError', () => {
  it('stops retrying a file that will never decode', () => {
    expect(isPermanentPreviewError('ffmpeg exited with code 1: Invalid data found when processing input')).toBe(true);
    expect(isPermanentPreviewError('sharp: Input buffer contains unsupported image format')).toBe(true);
    expect(isPermanentPreviewError('ffmpeg was killed with signal SIGSEGV')).toBe(true);
  });

  /* «Ролика больше нет» — тоже навсегда, а «нет токена VK» — нет: иначе строка крутится вечно. */
  it('separates a gone video from a provider we simply could not reach', () => {
    expect(isPermanentPreviewError(`${HOSTED_PREVIEW_UNAVAILABLE}: video_deleted`)).toBe(true);
    expect(isPermanentPreviewError(`${HOSTED_PREVIEW_RETRY}: vk_service_token_missing`)).toBe(false);
  });

  it('keeps a transient failure retryable', () => {
    expect(isPermanentPreviewError('download_timeout')).toBe(false);
    expect(isPermanentPreviewError('magick_not_found_or_failed')).toBe(false);
  });
});

describe('backoffMinutesAfterFailure', () => {
  it('grows with attempts and stops at a day', () => {
    expect(backoffMinutesAfterFailure(1)).toBe(2);
    expect(backoffMinutesAfterFailure(4)).toBe(16);
    expect(backoffMinutesAfterFailure(20)).toBe(1440);
  });
});
