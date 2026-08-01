import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateReceivedUpload, validateUploadIntent } from '@/modules/media/uploadValidation';

const fakes = vi.hoisted(() => ({
  insertValues: vi.fn(),
  s3DeleteObject: vi.fn(),
  s3PutObjectBody: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => '44444444-4444-4444-8444-444444444444',
  getCurrentObservabilityContext: () => ({}),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({
    insert: () => ({ values: fakes.insertValues }),
  }),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappSql: vi
    .fn()
    .mockResolvedValue({ rows: [{ id: '55555555-5555-4555-8555-555555555555' }] }),
}));
vi.mock('@/infra/s3/client', () => ({
  s3DeleteObject: fakes.s3DeleteObject,
  s3ListObjectKeysUnderPrefix: vi.fn(),
  s3ObjectKey: (id: string, filename: string) => `media/${id}/${filename}`,
  s3PublicUrl: vi.fn(),
  s3PutObjectBody: fakes.s3PutObjectBody,
}));

import { createS3MediaStoragePort } from './s3MediaStorage';

function receivedJpeg() {
  const intent = validateUploadIntent({
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 3,
    policyId: 'proxy',
  });
  if (!intent.ok) throw new Error('fixture intent rejected');
  const received = validateReceivedUpload({
    intent: intent.value,
    contentLength: 3,
    contentType: 'image/jpeg',
    firstBytes: new Uint8Array([0xff, 0xd8, 0xff]),
  });
  if (!received.ok) throw new Error('fixture object rejected');
  return received.value;
}

describe('proxy S3-to-DB lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.s3PutObjectBody.mockResolvedValue(undefined);
    fakes.insertValues.mockRejectedValue(new Error('db_insert_failed'));
  });

  it('compensates a successful object PUT when the ready-row insert fails', async () => {
    const port = createS3MediaStoragePort();

    await expect(
      port.upload({
        body: new Uint8Array([0xff, 0xd8, 0xff]),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        received: receivedJpeg(),
      }),
    ).rejects.toThrow('db_insert_failed');

    expect(fakes.s3PutObjectBody).toHaveBeenCalledOnce();
    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(
      'media/55555555-5555-4555-8555-555555555555/photo.jpg',
    );
  });
});
