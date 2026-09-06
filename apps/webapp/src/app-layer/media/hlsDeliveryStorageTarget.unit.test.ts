import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS: the HLS proxy reads a patient playlist or segment from the library store.
 * CONSEQUENCE: an uploaded patient video reaches ready state but playback returns a missing object.
 * ORACLE: the patient-media-storage owner ruling requires every read to use the row's target.
 * The exported HLS proxy is the cheapest public boundary which observes playlist and stream reads.
 */
const fakes = vi.hoisted(() => ({
  getRow: vi.fn(),
  getBuffer: vi.fn(),
  getStream: vi.fn(),
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app-layer/media/hlsTrustedOriginPrefixes', () => ({
  buildTrustedPrivateObjectUrlPrefixes: () => [],
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  getMediaRowForPlayback: fakes.getRow,
}));
vi.mock('@/app-layer/media/s3Client', () => ({
  s3GetPrivateObjectBuffer: fakes.getBuffer,
  s3GetObjectStream: fakes.getStream,
}));
vi.mock('@/app-layer/media/hlsProxyErrorEvents', () => ({
  recordMediaHlsProxyErrorEventIfNeeded: vi.fn(),
  shouldRecordMediaHlsProxyError: () => false,
}));

import { handleHlsDeliveryProxyRequest } from './hlsDeliveryProxy';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

describe('HLS delivery follows the row storage target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getRow.mockResolvedValue({ storage_target: 'patient' });
    fakes.getBuffer.mockResolvedValue({ ok: true, buf: Buffer.from('#EXTM3U\nsegment.ts\n') });
    fakes.getStream.mockResolvedValue({
      ok: true,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('segment'));
          controller.close();
        },
      }),
      httpStatus: 200,
      contentLength: 7,
      contentType: 'video/mp2t',
    });
  });

  it('reads a playlist from the patient store', async () => {
    const response = await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['master.m3u8'],
      rangeHeader: null,
      userId: 'patient-1',
    });

    expect(response.status).toBe(200);
    expect(fakes.getBuffer).toHaveBeenCalledWith(
      `media/${MEDIA_ID}/hls/master.m3u8`,
      'patient',
    );
  });

  it('streams a segment from the patient store', async () => {
    const response = await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['720p', 'segment-00001.ts'],
      rangeHeader: 'bytes=0-6',
      userId: 'patient-1',
    });

    expect(response.status).toBe(200);
    expect(fakes.getStream).toHaveBeenCalledWith({
      key: `media/${MEDIA_ID}/hls/720p/segment-00001.ts`,
      range: 'bytes=0-6',
      target: 'patient',
    });
  });
});
