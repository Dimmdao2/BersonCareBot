import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getObject: vi.fn(),
  getRow: vi.fn(),
  presign: vi.fn(),
}));

vi.mock('./s3MediaStorage', () => ({
  getMediaS3KeyForRedirect: fakes.getObject,
  getMediaRowForPlayback: fakes.getRow,
}));
vi.mock('./s3DeliveryClient', () => ({ presignDeliveryGetUrl: fakes.presign }));

import { resolveInlineMediaDeliveryUrl } from './resolveInlineMediaDeliveryUrl';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

describe('resolveInlineMediaDeliveryUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.presign.mockResolvedValue('https://storage.example/hot-rendition');
  });

  it('returns only the standard image object accepted by the shared resolver', async () => {
    fakes.getObject.mockResolvedValue({
      key: `media/${MEDIA_ID}/standard.webp`,
      target: 'patient',
    });

    await expect(resolveInlineMediaDeliveryUrl(MEDIA_ID, 'image/png', 300)).resolves.toBe(
      'https://storage.example/hot-rendition',
    );
    expect(fakes.presign).toHaveBeenCalledWith(
      `media/${MEDIA_ID}/standard.webp`,
      300,
      'patient',
      { mimeType: 'image/webp' },
    );
  });

  it('returns no image URL when the standard rendition is not ready', async () => {
    fakes.getObject.mockResolvedValue(null);

    await expect(resolveInlineMediaDeliveryUrl(MEDIA_ID, 'image/jpeg', 300)).resolves.toBeNull();
    expect(fakes.presign).not.toHaveBeenCalled();
  });

  it('returns the same-origin HLS proxy only for a trusted ready ladder', async () => {
    fakes.getRow.mockResolvedValue({
      video_processing_status: 'ready',
      hls_master_playlist_s3_key: `media/${MEDIA_ID}/hls/master.m3u8`,
    });

    await expect(resolveInlineMediaDeliveryUrl(MEDIA_ID, 'video/mp4', 300)).resolves.toBe(
      `/api/media/${MEDIA_ID}/hls/master.m3u8`,
    );
    expect(fakes.presign).not.toHaveBeenCalled();
  });

  it('gives documents no inline URL and does not touch storage', async () => {
    await expect(
      resolveInlineMediaDeliveryUrl(MEDIA_ID, 'application/pdf', 300),
    ).resolves.toBeNull();
    expect(fakes.getObject).not.toHaveBeenCalled();
    expect(fakes.getRow).not.toHaveBeenCalled();
    expect(fakes.presign).not.toHaveBeenCalled();
  });
});
