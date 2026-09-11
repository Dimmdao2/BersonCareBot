import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS: `hlsDeliveryProxy.ts` accumulates the daily byte counter on the exact same request
 * path that serves the patient's video — the proxy must serve bytes exactly as today no matter what
 * the counter does.
 * CONSEQUENCE (byte counting): if a Range/206 response were counted by the full object size instead
 * of the delivered range, the owner's "объём выданного трафика" figure would be inflated by every
 * HLS player seek (each partial re-fetch of the same segment would count as if the whole segment
 * were sent again).
 * CONSEQUENCE (write failure): if a bug in the counter could throw on the response path, a working
 * segment delivery would turn into a 5xx — cost accounting is not allowed to cost availability.
 * ORACLE: `streamed.contentLength` is S3's own `Content-Length` for THIS response (206 partial ⇒ the
 * range length, not the resource's total size) — see the code comment at the call site; and
 * `recordHlsDeliveryBytes`'s documented contract of never throwing.
 */
const fakes = vi.hoisted(() => ({
  getRow: vi.fn(),
  getBuffer: vi.fn(),
  getStream: vi.fn(),
  getOrgId: vi.fn(),
  recordHlsDeliveryBytes: vi.fn(),
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
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: fakes.getOrgId,
}));
// Partial mock: real accumulator behaviour by default (so the range/full-size assertions exercise
// the real folding logic), but `recordHlsDeliveryBytes` itself is swappable per test to prove the
// proxy survives a counter failure.
vi.mock('@/app-layer/media/hlsDeliveryByteMeter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hlsDeliveryByteMeter')>();
  fakes.recordHlsDeliveryBytes.mockImplementation(actual.recordHlsDeliveryBytes);
  return { ...actual, recordHlsDeliveryBytes: fakes.recordHlsDeliveryBytes };
});

import { handleHlsDeliveryProxyRequest } from './hlsDeliveryProxy';
import { snapshotAndClearHlsDeliveryByteMeter } from './hlsDeliveryByteMeter';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const FULL_SEGMENT_BYTES = 1_000_000;
const RANGE_BYTES = 12_345;

function stubReadableStream(payloadLength: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(payloadLength));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshotAndClearHlsDeliveryByteMeter();
  fakes.getRow.mockResolvedValue({ storage_target: 'patient' });
  fakes.getOrgId.mockReturnValue('org-1');
});

describe('HLS proxy byte metering', () => {
  it('a Range response is counted by the delivered range length, not the full segment size', async () => {
    // S3's own `ContentLength` for a 206 partial response is the bytes actually returned — the mock
    // stands in for that: the object is 1MB, but only ~12KB were requested and sent back.
    fakes.getStream.mockResolvedValue({
      ok: true,
      stream: stubReadableStream(RANGE_BYTES),
      httpStatus: 206,
      contentLength: RANGE_BYTES,
      contentRange: `bytes 0-${RANGE_BYTES - 1}/${FULL_SEGMENT_BYTES}`,
      contentType: 'video/mp2t',
    });

    const response = await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['576p', 'segment-00001.ts'],
      rangeHeader: `bytes=0-${RANGE_BYTES - 1}`,
      userId: 'patient-1',
    });

    expect(response.status).toBe(206);
    const rows = snapshotAndClearHlsDeliveryByteMeter();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mediaId: MEDIA_ID, quality: '576p', bytesTotal: RANGE_BYTES });
    expect(rows[0]!.bytesTotal).not.toBe(FULL_SEGMENT_BYTES);
  });

  it('a full (non-Range) segment response is counted by Content-Length', async () => {
    fakes.getStream.mockResolvedValue({
      ok: true,
      stream: stubReadableStream(FULL_SEGMENT_BYTES),
      httpStatus: 200,
      contentLength: FULL_SEGMENT_BYTES,
      contentType: 'video/mp2t',
    });

    await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['720p', 'segment-00002.ts'],
      rangeHeader: null,
      userId: 'patient-1',
    });

    const rows = snapshotAndClearHlsDeliveryByteMeter();
    expect(rows[0]).toMatchObject({ quality: '720p', bytesTotal: FULL_SEGMENT_BYTES, requestCount: 1 });
  });

  it('a byte-counter failure never turns a successful segment delivery into an error response', async () => {
    fakes.getStream.mockResolvedValue({
      ok: true,
      stream: stubReadableStream(RANGE_BYTES),
      httpStatus: 206,
      contentLength: RANGE_BYTES,
      contentType: 'video/mp2t',
    });
    fakes.recordHlsDeliveryBytes.mockImplementation(() => {
      throw new Error('meter blew up');
    });

    const response = await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['576p', 'segment-00003.ts'],
      rangeHeader: `bytes=0-${RANGE_BYTES - 1}`,
      userId: 'patient-1',
    });

    // The proxy still serves the bytes; the counter's own contract (never throw) is a second,
    // independent line of defense, not the only one — a hard failure in the counter module must
    // still not surface to the patient as a broken video.
    expect(response.status).toBe(206);
  });

  it('a failure resolving the organization for metering never turns delivery into a 502', async () => {
    // `getCurrentDbPrincipalOrganizationId()` runs as an ARGUMENT to the metering call, before
    // `recordHlsDeliveryBytes`'s own try/catch even starts — this is exactly the gap
    // `recordHlsDeliveryBytesSafely` closes at the call site.
    fakes.getStream.mockResolvedValue({
      ok: true,
      stream: stubReadableStream(RANGE_BYTES),
      httpStatus: 206,
      contentLength: RANGE_BYTES,
      contentType: 'video/mp2t',
    });
    fakes.getOrgId.mockImplementation(() => {
      throw new Error('principal context blew up');
    });

    const response = await handleHlsDeliveryProxyRequest({
      mediaId: MEDIA_ID,
      pathSegments: ['576p', 'segment-00004.ts'],
      rangeHeader: `bytes=0-${RANGE_BYTES - 1}`,
      userId: 'patient-1',
    });

    expect(response.status).toBe(206);
  });
});
