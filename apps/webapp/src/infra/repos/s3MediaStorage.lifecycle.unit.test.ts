import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { validateReceivedUpload, validateUploadIntent } from '@/modules/media/uploadValidation';

const fakes = vi.hoisted(() => ({
  insertValues: vi.fn(),
  readyReturning: vi.fn(),
  abortReturning: vi.fn(),
  deleteWhere: vi.fn(),
  getPool: vi.fn(),
  startTransaction: vi.fn(),
  runSql: vi.fn(),
  staleCandidates: vi.fn(),
  runMutation: vi.fn(),
  s3DeleteObject: vi.fn(),
  s3PutObjectBody: vi.fn(),
  principalKind: 'staff' as 'staff' | 'patient',
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: fakes.principalKind }),
  getCurrentDbPrincipalOrganizationId: () => '44444444-4444-4444-8444-444444444444',
  getCurrentObservabilityContext: () => ({}),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({
    insert: () => ({ values: fakes.insertValues }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: fakes.readyReturning }),
      }),
    }),
  }),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappSql: fakes.runSql,
}));
vi.mock('@/infra/db/client', () => ({ getPool: fakes.getPool }));
vi.mock('@/infra/db/withClient', () => ({
  startPoolTransaction: fakes.startTransaction,
  withPoolTransaction: vi.fn(),
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: fakes.runMutation,
}));
vi.mock('@/infra/s3/client', () => ({
  s3DeleteObject: fakes.s3DeleteObject,
  s3ListObjectKeysUnderPrefix: vi.fn().mockResolvedValue([]),
  s3ObjectKey: (id: string, filename: string) => `media/${id}/${filename}`,
  s3PublicUrl: vi.fn(),
  s3PutObjectBody: fakes.s3PutObjectBody,
}));

import {
  createS3MediaStoragePort,
  purgePendingMediaDeleteBatch,
  stagePendingMediaAbort,
  stageStaleSinglePutMediaForPurge,
} from './s3MediaStorage';

const lifecycleTx = {
  delete: () => ({ where: fakes.deleteWhere }),
  select: () => ({
    from: () => ({
      where: () => ({ orderBy: () => ({ limit: fakes.staleCandidates }) }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({ returning: fakes.abortReturning }),
    }),
  }),
};

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
    fakes.principalKind = 'staff';
    fakes.insertValues.mockResolvedValue(undefined);
    fakes.s3PutObjectBody.mockResolvedValue(undefined);
    fakes.readyReturning.mockResolvedValue([]);
    fakes.abortReturning.mockResolvedValue([]);
    fakes.deleteWhere.mockResolvedValue(undefined);
    fakes.staleCandidates.mockResolvedValue([]);
    fakes.runMutation.mockImplementation((fn: (tx: typeof lifecycleTx) => unknown) =>
      Promise.resolve(fn(lifecycleTx)),
    );
  });

  it('reads patient media without joining staff identity tables', async () => {
    fakes.principalKind = 'patient';
    fakes.runSql.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();

    await expect(port.getById('55555555-5555-4555-8555-555555555555')).resolves.toBeNull();

    const query = fakes.runSql.mock.calls[0]?.[1];
    if (!query) throw new Error('patient_media_query_not_issued');
    const rendered = new PgDialect().sqlToQuery(query).sql;
    expect(rendered).toContain('FROM media_files m');
    expect(rendered).not.toContain('platform_users');
    expect(rendered).not.toContain('user_identity');
  });

  it('records pending before PUT and leaves it durable when the ready CAS fails', async () => {
    const port = createS3MediaStoragePort();

    await expect(
      port.upload({
        body: Buffer.from([0xff, 0xd8, 0xff]),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        received: receivedJpeg(),
      }),
    ).rejects.toThrow('media_upload_commit_failed');

    expect(fakes.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', originalName: 'photo.jpg' }),
    );
    expect(fakes.s3PutObjectBody).toHaveBeenCalledOnce();
    expect(fakes.readyReturning).toHaveBeenCalledOnce();
    expect(fakes.s3DeleteObject).not.toHaveBeenCalled();
  });

  it('does not PUT an object when creating its durable pending lifecycle row fails', async () => {
    fakes.insertValues.mockRejectedValueOnce(new Error('pending_insert_failed'));
    const port = createS3MediaStoragePort();

    await expect(
      port.upload({
        body: Buffer.from([0xff, 0xd8, 0xff]),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        received: receivedJpeg(),
      }),
    ).rejects.toThrow('pending_insert_failed');

    expect(fakes.s3PutObjectBody).not.toHaveBeenCalled();
  });
});

describe('pending upload abort lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.principalKind = 'staff';
    fakes.abortReturning.mockResolvedValue([]);
    fakes.deleteWhere.mockResolvedValue(undefined);
    fakes.staleCandidates.mockResolvedValue([]);
    fakes.runMutation.mockImplementation((fn: (tx: typeof lifecycleTx) => unknown) =>
      Promise.resolve(fn(lifecycleTx)),
    );
  });

  it('keeps pending_delete retryable when S3 deletion fails during the shared purge', async () => {
    const tx = {
      client: {},
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    fakes.getPool.mockReturnValue({});
    fakes.startTransaction.mockResolvedValue(tx);
    fakes.s3DeleteObject.mockRejectedValueOnce(new Error('s3_delete_failed'));
    fakes.runSql
      .mockResolvedValueOnce({
        rows: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            s3_key: 'media/55555555-5555-4555-8555-555555555555/photo.jpg',
            preview_sm_key: null,
            preview_md_key: null,
            hls_artifact_prefix: null,
            poster_s3_key: null,
            hls_master_playlist_s3_key: null,
            status: 'pending_delete',
            delete_attempts: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });

    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(
      'media/55555555-5555-4555-8555-555555555555/photo.jpg',
    );
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(fakes.runSql).toHaveBeenCalledTimes(3);
  });

  it('stages a linked pending upload before removing only its linked patient-file metadata', async () => {
    fakes.abortReturning.mockResolvedValueOnce([{ id: '55555555-5555-4555-8555-555555555555' }]);

    await expect(stagePendingMediaAbort('55555555-5555-4555-8555-555555555555')).resolves.toBe(
      true,
    );

    expect(fakes.abortReturning).toHaveBeenCalledOnce();
    expect(fakes.deleteWhere).toHaveBeenCalledOnce();
  });

  it('does not remove patient-file metadata when the media row is no longer pending', async () => {
    await expect(stagePendingMediaAbort('55555555-5555-4555-8555-555555555555')).resolves.toBe(
      false,
    );

    expect(fakes.deleteWhere).not.toHaveBeenCalled();
  });

  it('stages only the stale sessionless candidates selected for the existing purge batch', async () => {
    fakes.staleCandidates.mockResolvedValueOnce([{ id: '55555555-5555-4555-8555-555555555555' }]);
    fakes.abortReturning.mockResolvedValueOnce([{ id: '55555555-5555-4555-8555-555555555555' }]);

    await expect(stageStaleSinglePutMediaForPurge(25)).resolves.toBe(1);

    expect(fakes.staleCandidates).toHaveBeenCalledWith(25);
    expect(fakes.abortReturning).toHaveBeenCalledOnce();
  });
});
