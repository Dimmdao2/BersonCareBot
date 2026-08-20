import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The worker is the only writer of `media_files.standard_rendition_at`. That column is the row's
 * single fact that the object at `s3_key` is our encoder's output, and the UI shows a stored file
 * before its thumbnail exists on that fact alone — so the write has to be covered here, not
 * inferred from the key suffix or the mime type.
 */

const runWebappSql = vi.fn(async () => ({ rows: [] as unknown[] }));
const claimedRow = {
  id: '00000000-0000-4000-8000-0000000000c1',
  s3_key: 'media/00000000-0000-4000-8000-0000000000c1/source.jpg',
  mime_type: 'image/jpeg',
  size_bytes: '2000000',
  preview_attempts: 0,
  source_width: null,
  source_height: null,
};

vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(vi.fn(), { setFfmpegPath: vi.fn(), ffprobe: vi.fn() }),
}));
vi.mock('@ffmpeg-installer/ffmpeg', () => ({ default: { path: '/bin/ffmpeg' } }));
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('@/config/env', () => ({ env: {} }));
vi.mock('@/infra/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/infra/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) =>
    fn({}),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlFromPgClient: () => ({}),
  runWebappSql: (...args: unknown[]) => runWebappSql(...(args as [])),
}));
vi.mock('@/infra/s3/client', () => ({
  presignGetUrl: vi.fn(async () => 'https://example.invalid/presigned'),
  s3DeleteObject: vi.fn(async () => {}),
  s3GetObjectBody: vi.fn(async () => Buffer.from('source-bytes')),
  s3HeadObject: vi.fn(async () => true),
  s3PreviewKey: (id: string, size: string) => `previews/${size}/${id}.jpg`,
  s3PutObjectBody: vi.fn(async () => {}),
  s3StandardImageKey: (id: string) => `media/${id}/standard.webp`,
}));
vi.mock('@/modules/media/imageStandardRendition', () => ({
  encodeStandardImageRendition: vi.fn(),
  buildImageStandardRendition: vi.fn(async () => ({
    standardKey: `media/${claimedRow.id}/standard.webp`,
    mimeType: 'image/webp',
    sizeBytes: 120_000,
    width: 1440,
    height: 1080,
    smKey: `previews/sm/${claimedRow.id}.jpg`,
    mdKey: `previews/md/${claimedRow.id}.jpg`,
    supersededOriginalKey: claimedRow.s3_key,
  })),
}));

const { processMediaPreviewBatch } = await import('./mediaPreviewWorker');

/** SQL text of every statement the worker issued, in order. */
function issuedSql(): string[] {
  return runWebappSql.mock.calls.map((call) => {
    const query = (call as unknown as unknown[])[1] as { queryChunks?: unknown[] };
    return JSON.stringify(query.queryChunks ?? query);
  });
}

function claimThen(row: Record<string, unknown> | null) {
  let claimed = false;
  runWebappSql.mockImplementation(async () => {
    if (!claimed) {
      claimed = true;
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  runWebappSql.mockReset();
});

describe('processMediaPreviewBatch standard rendition fact', () => {
  it('records standard_rendition_at in the same statement that repoints s3_key', async () => {
    claimThen(claimedRow);

    await processMediaPreviewBatch(1);

    const update = issuedSql().find((text) => text.includes('s3_key ='));
    expect(update).toBeDefined();
    expect(update).toContain('standard_rendition_at');
  });

  it('leaves standard_rendition_at unset for an image the size guard skips', async () => {
    claimThen({ ...claimedRow, size_bytes: String(500 * 1024 * 1024) });

    await processMediaPreviewBatch(1);

    const statements = issuedSql();
    expect(statements.some((text) => text.includes("preview_status = 'skipped'"))).toBe(true);
    expect(statements.some((text) => text.includes('standard_rendition_at'))).toBe(false);
  });

});
