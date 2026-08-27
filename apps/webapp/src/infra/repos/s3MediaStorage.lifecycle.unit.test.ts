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
  runNamedRoot: vi.fn(),
  staleCandidates: vi.fn(),
  runMutation: vi.fn(),
  s3DeleteObject: vi.fn(),
  s3AbortMultipartUpload: vi.fn(),
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
  runWebappNamedRoot: fakes.runNamedRoot,
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
  s3AbortMultipartUpload: fakes.s3AbortMultipartUpload,
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
import { stageExpiredMultipartSessionForPurgeTx } from './mediaUploadSessionsRepo';

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
    fakes.runNamedRoot.mockResolvedValue({ rows: [{ staged_count: 0 }] });
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
    fakes.runNamedRoot.mockResolvedValue({ rows: [{ staged_count: 0 }] });
    fakes.principalKind = 'staff';
    fakes.abortReturning.mockResolvedValue([]);
    fakes.deleteWhere.mockResolvedValue(undefined);
    fakes.staleCandidates.mockResolvedValue([]);
    fakes.runMutation.mockImplementation((fn: (tx: typeof lifecycleTx) => unknown) =>
      Promise.resolve(fn(lifecycleTx)),
    );
  });

  function purgeTx() {
    return {
      client: {},
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
  }

  const MEDIA_ID = '55555555-5555-4555-8555-555555555555';
  const MEDIA_KEY = 'media/55555555-5555-4555-8555-555555555555/photo.jpg';

  /**
   * Renders the SQL TEXT of a drizzle `sql` template. `String(query.queryChunks)` — used elsewhere in
   * this file — yields `'[object Object],<param>,[object Object]'` and therefore matches no SQL
   * pattern at all, so an assertion built on it passes no matter what the code does.
   */
  function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks?: unknown })?.queryChunks;
    if (!Array.isArray(chunks)) return String(query);
    return chunks
      .map((chunk) => {
        const value = (chunk as { value?: unknown })?.value;
        return Array.isArray(value) ? value.join('') : '';
      })
      .join(' ');
  }

  function claimedRow() {
    return {
      rows: [
        {
          id: MEDIA_ID,
          s3_key: MEDIA_KEY,
          preview_sm_key: null,
          preview_md_key: null,
          hls_artifact_prefix: null,
          poster_s3_key: null,
          hls_master_playlist_s3_key: null,
          status: 'pending_delete',
          delete_attempts: 0,
        },
      ],
    };
  }

  it('keeps pending_delete retryable when S3 deletion fails during the shared purge', async () => {
    const tx = purgeTx();
    fakes.getPool.mockReturnValue({});
    fakes.startTransaction.mockResolvedValue(tx);
    fakes.s3DeleteObject.mockRejectedValueOnce(new Error('s3_delete_failed'));
    fakes.runSql
      .mockResolvedValueOnce(claimedRow())
      // no unfinished multipart session for this row
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });

    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(fakes.runSql).toHaveBeenCalledTimes(4);
  });

  /**
   * WHAT BREAKS WITHOUT THIS (audit §D1): the multipart parts stay in the bucket forever and nothing
   * in the database can name them again, because `s3_key` + `upload_id` live only on the session row
   * that cascade-dies with the media row. The tick reported success while leaking storage.
   */
  it('aborts the multipart upload BEFORE deleting anything, and keeps the row retryable when the abort fails', async () => {
    const tx = purgeTx();
    fakes.getPool.mockReturnValue({});
    fakes.startTransaction.mockResolvedValue(tx);
    fakes.s3AbortMultipartUpload.mockRejectedValueOnce(new Error('s3_abort_failed'));
    fakes.runSql
      .mockResolvedValueOnce(claimedRow())
      .mockResolvedValueOnce({ rows: [{ s3_key: MEDIA_KEY, upload_id: 'upload-1' }] })
      // schedulePendingDeleteRetry
      .mockResolvedValueOnce({ rowCount: 1 })
      // trailing orphan sweep
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });

    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');
    // The row (and with it the surviving session that holds the retry identity) is NOT deleted, and
    // no object delete was attempted on an upload that was never aborted.
    expect(fakes.s3DeleteObject).not.toHaveBeenCalled();
    const statements = fakes.runSql.mock.calls.map((call) => sqlTextOf(call[1]));
    expect(statements.some((sql) => /DELETE FROM media_files WHERE id/i.test(sql))).toBe(false);
    expect(tx.commit).toHaveBeenCalledOnce();
  });

  it('deletes objects only after a confirmed multipart abort', async () => {
    const tx = purgeTx();
    fakes.getPool.mockReturnValue({});
    fakes.startTransaction.mockResolvedValue(tx);
    fakes.s3AbortMultipartUpload.mockResolvedValueOnce(undefined);
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    fakes.runSql
      .mockResolvedValueOnce(claimedRow())
      .mockResolvedValueOnce({ rows: [{ s3_key: MEDIA_KEY, upload_id: 'upload-1' }] })
      // DELETE FROM media_files
      .mockResolvedValueOnce({ rowCount: 1 })
      // trailing orphan sweep
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await purgePendingMediaDeleteBatch(1);

    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');
    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
    expect(result.errors).toBe(0);
  });

  /**
   * AUDITOR ACCEPTANCE TEST (independent audit of 2403aaadf, audit §D1 / stage 4 acceptance
   * "повторный запуск завершает работу ровно один раз").
   *
   * WHAT BREAKS WITHOUT THIS: the abort step is not idempotent. Once an `AbortMultipartUpload` has
   * SUCCEEDED, nothing records that fact — the session row keeps `status = 'expired'`, which is not
   * in the `('completed','aborted')` exclusion of the session lookup, so the very next tick calls
   * abort again on an upload S3 no longer knows. S3 answers `NoSuchUpload`, `s3AbortMultipartUpload`
   * throws (it swallows nothing), `abortFailed` is set, and the row is pushed back onto the backoff
   * WITHOUT ever being deleted. The backoff caps at one day and has no attempt limit and no terminal
   * state, so the media row and its session live forever and `/api/internal/media-pending-delete/purge`
   * returns HTTP 500 on every tick from then on — a red operator card that no retry can clear.
   *
   * REACHED BY: any failure AFTER a successful abort inside the same iteration. Here the object
   * delete of tick 1 fails (transient S3 error), which the suite above already treats as an ordinary
   * retryable outcome. The same permanent stick is reached with no transient failure at all if the
   * bucket carries an `AbortIncompleteMultipartUpload` lifecycle rule, or if the upload was completed
   * out of band — both make the FIRST abort answer `NoSuchUpload`.
   *
   * ORACLE: the owner plan, `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, stage 4
   * acceptance — "fault injection ... оставляет retryable запись, красный tick и операторский сигнал;
   * повторный запуск завершает работу ровно один раз". A repeat run must finish the work, not restart
   * a step that can never succeed again.
   */
  it('finishes the work on the retry after an abort that already succeeded', async () => {
    fakes.getPool.mockReturnValue({});

    // ── tick 1: abort confirmed, then the object delete fails → retryable, red, nothing removed ──
    const firstTx = purgeTx();
    fakes.startTransaction.mockResolvedValue(firstTx);
    fakes.s3AbortMultipartUpload.mockResolvedValueOnce(undefined);
    fakes.s3DeleteObject.mockRejectedValueOnce(new Error('s3_delete_failed'));
    fakes.runSql
      .mockResolvedValueOnce(claimedRow())
      .mockResolvedValueOnce({ rows: [{ s3_key: MEDIA_KEY, upload_id: 'upload-1' }] })
      // schedulePendingDeleteRetry
      .mockResolvedValueOnce({ rowCount: 1 })
      // trailing orphan sweep
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });
    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');

    // ── tick 2: the session still says 'expired', so the same upload is aborted a second time. S3
    // has already forgotten it: NoSuchUpload. The retry must still finish the cleanup. ──
    vi.clearAllMocks();
    const secondTx = purgeTx();
    fakes.startTransaction.mockResolvedValue(secondTx);
    const noSuchUpload = Object.assign(new Error('NoSuchUpload'), {
      name: 'NoSuchUpload',
      $metadata: { httpStatusCode: 404 },
    });
    fakes.s3AbortMultipartUpload.mockRejectedValueOnce(noSuchUpload);
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    fakes.runSql
      .mockResolvedValueOnce({
        rows: [{ ...claimedRow().rows[0], delete_attempts: 1 }],
      })
      .mockResolvedValueOnce({ rows: [{ s3_key: MEDIA_KEY, upload_id: 'upload-1' }] })
      // DELETE FROM media_files
      .mockResolvedValueOnce({ rowCount: 1 })
      // trailing orphan sweep
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const retry = await purgePendingMediaDeleteBatch(1);

    // An upload S3 no longer holds IS an aborted upload. The retry must treat it as done and
    // complete the cleanup exactly once, instead of parking the row on the backoff forever.
    expect(retry).toEqual({ removed: 1, errors: 0 });
    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
  });

  /**
   * AUDITOR ACCEPTANCE TEST (independent audit of 2403aaadf, audit §D1).
   *
   * WHAT BREAKS WITHOUT THIS: the expiry tick goes back to deleting `media_files` first. That
   * cascade-deletes `media_upload_sessions`, the ONLY row holding `s3_key` + `upload_id`, so the
   * multipart parts stay in the bucket with nothing in the database able to name them — and the tick
   * still reports success. This is the exact shape audit §D1 names, and reverting
   * `stageExpiredMultipartSessionForPurgeTx` to a `DELETE FROM media_files` leaves every other test
   * in this branch green: the route test mocks this function away, so nothing else watches the
   * ordering the fix is about.
   *
   * ORACLE: owner plan `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, stage 4 —
   * "Не удалять retry identity до подтверждённого S3 Abort/Delete".
   */
  it('hands an expired multipart session to the purge lifecycle without destroying the retry identity', async () => {
    const SESSION_ID = '66666666-6666-4666-8666-666666666666';
    fakes.runSql
      // lockExpiredSessionForCleanupTx
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, media_id: MEDIA_ID, s3_key: MEDIA_KEY, upload_id: 'upload-1' }],
      })
      // UPDATE media_files -> pending_delete
      .mockResolvedValueOnce({ rowCount: 1 })
      // markUploadSessionExpiredTx
      .mockResolvedValueOnce({ rowCount: 1 })
      // DELETE FROM patient_files
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(
      stageExpiredMultipartSessionForPurgeTx({} as never, SESSION_ID),
    ).resolves.toBe('staged');

    const statements = fakes.runSql.mock.calls.map((call) => sqlTextOf(call[1]));
    // The media row is STAGED, never deleted here...
    expect(statements.some((sql) => /UPDATE media_files/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /DELETE FROM media_files/i.test(sql))).toBe(false);
    // ...and the session that carries s3_key + upload_id survives for the confirmed abort.
    expect(statements.some((sql) => /DELETE FROM media_upload_sessions/i.test(sql))).toBe(false);
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
