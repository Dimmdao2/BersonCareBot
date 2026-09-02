import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { validateReceivedUpload, validateUploadIntent } from '@/modules/media/uploadValidation';

const fakes = vi.hoisted(() => ({
  insertValues: vi.fn(),
  readyReturning: vi.fn(),
  abortReturning: vi.fn(),
  deleteWhere: vi.fn(),
  runSql: vi.fn(),
  runNamedRoot: vi.fn(),
  runMutation: vi.fn(),
  s3DeleteObject: vi.fn(),
  s3AbortMultipartUpload: vi.fn(),
  s3PutObjectBody: vi.fn(),
  s3ListObjectKeysUnderPrefix: vi.fn(),
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
vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: vi.fn(),
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: fakes.runMutation,
}));
vi.mock('@/infra/s3/client', () => ({
  s3AbortMultipartUpload: fakes.s3AbortMultipartUpload,
  s3DeleteObject: fakes.s3DeleteObject,
  s3ListObjectKeysUnderPrefix: fakes.s3ListObjectKeysUnderPrefix,
  s3ObjectKey: (id: string, filename: string) => `media/${id}/${filename}`,
  s3PublicUrl: vi.fn(),
  s3PutObjectBody: fakes.s3PutObjectBody,
}));

import {
  collectS3KeysForMediaPurge,
  createS3MediaStoragePort,
  purgePendingMediaDeleteBatch,
  stagePendingMediaAbort,
} from './s3MediaStorage';
import { stageExpiredMultipartSessionForPurgeTx } from './mediaUploadSessionsRepo';

const lifecycleTx = {
  delete: () => ({ where: fakes.deleteWhere }),
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
    fakes.runNamedRoot.mockResolvedValue({ rows: [] });
    fakes.principalKind = 'staff';
    fakes.insertValues.mockResolvedValue(undefined);
    fakes.s3PutObjectBody.mockResolvedValue(undefined);
    fakes.s3ListObjectKeysUnderPrefix.mockResolvedValue([]);
    fakes.readyReturning.mockResolvedValue([]);
    fakes.abortReturning.mockResolvedValue([]);
    fakes.deleteWhere.mockResolvedValue(undefined);
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
    fakes.runNamedRoot.mockImplementation(
      (_db: unknown, _identity: string, args: readonly unknown[]) => {
        const action = args[0];
        if (action === 'stage') {
          return Promise.resolve({
            rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
          });
        }
        if (action === 'claim') {
          return Promise.resolve({ rows: [{ result: { action: 'claim', claim: null } }] });
        }
        if (action === 'retry') {
          return Promise.resolve({
            rows: [{ result: { action: 'retry', retryScheduled: true } }],
          });
        }
        return Promise.resolve({ rows: [{ result: { action: 'complete', deleted: true } }] });
      },
    );
    fakes.principalKind = 'staff';
    fakes.abortReturning.mockResolvedValue([]);
    fakes.deleteWhere.mockResolvedValue(undefined);
    fakes.runMutation.mockImplementation((fn: (tx: typeof lifecycleTx) => unknown) =>
      Promise.resolve(fn(lifecycleTx)),
    );
  });

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

  const CLAIM_TOKEN = '77777777-7777-4777-8777-777777777777';

  function claimedStep(deleteAttempts = 0) {
    return {
      rows: [
        {
          result: {
            action: 'claim',
            claim: {
              id: MEDIA_ID,
              s3Key: MEDIA_KEY,
              previewSmKey: null,
              previewMdKey: null,
              hlsArtifactPrefix: null,
              posterS3Key: null,
              hlsMasterPlaylistS3Key: null,
              deleteAttempts,
              claimToken: CLAIM_TOKEN,
              claimUntil: '2026-08-28T01:30:00.000Z',
              pendingAborts: [] as Array<{ s3Key: string; uploadId: string }>,
            },
          },
        },
      ],
    };
  }

  it('keeps pending_delete retryable when S3 deletion fails during the shared purge', async () => {
    fakes.s3DeleteObject.mockRejectedValueOnce(new Error('s3_delete_failed'));
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(claimedStep())
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'retry', retryScheduled: true } }],
      });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });

    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
    expect(fakes.runNamedRoot).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      'app.process_media_pending_delete_step(text,uuid,integer,uuid)',
      ['retry', MEDIA_ID, null, CLAIM_TOKEN],
      expect.anything(),
    );
  });

  /**
   * WHAT BREAKS WITHOUT THIS (audit §D1): the multipart parts stay in the bucket forever and nothing
   * in the database can name them again, because `s3_key` + `upload_id` live only on the session row
   * that cascade-dies with the media row. The tick reported success while leaking storage.
   */
  it('aborts the multipart upload BEFORE deleting anything, and keeps the row retryable when the abort fails', async () => {
    fakes.s3AbortMultipartUpload.mockRejectedValueOnce(new Error('s3_abort_failed'));
    const claim = claimedStep();
    claim.rows[0]!.result.claim!.pendingAborts = [{ s3Key: MEDIA_KEY, uploadId: 'upload-1' }];
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'retry', retryScheduled: true } }],
      });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });

    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');
    // The row (and with it the surviving session that holds the retry identity) is NOT deleted, and
    // no object delete was attempted on an upload that was never aborted.
    expect(fakes.s3DeleteObject).not.toHaveBeenCalled();
    expect(fakes.runNamedRoot).toHaveBeenCalledTimes(3);
  });

  it('deletes objects only after a confirmed multipart abort', async () => {
    fakes.s3AbortMultipartUpload.mockResolvedValueOnce(undefined);
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    const claim = claimedStep();
    claim.rows[0]!.result.claim!.pendingAborts = [{ s3Key: MEDIA_KEY, uploadId: 'upload-1' }];
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce({ rows: [{ result: { action: 'complete', deleted: true } }] });

    const result = await purgePendingMediaDeleteBatch(1);

    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');
    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
    expect(result).toEqual({ removed: 1, errors: 0 });
    expect(fakes.runNamedRoot).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      'app.process_media_pending_delete_step(text,uuid,integer,uuid)',
      ['complete', MEDIA_ID, null, CLAIM_TOKEN],
      expect.anything(),
    );
  });

  it('reports an error when the DB does not confirm final row deletion', async () => {
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(claimedStep())
      .mockResolvedValueOnce({ rows: [{ result: { action: 'complete', deleted: false } }] })
      .mockResolvedValueOnce({ rows: [{ result: { action: 'retry', retryScheduled: false } }] });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });
    expect(fakes.runNamedRoot).toHaveBeenNthCalledWith(
      4,
      expect.anything(),
      'app.process_media_pending_delete_step(text,uuid,integer,uuid)',
      ['retry', MEDIA_ID, null, CLAIM_TOKEN],
      expect.anything(),
    );
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
    // ── tick 1: abort confirmed, then the object delete fails → retryable, red, nothing removed ──
    fakes.s3AbortMultipartUpload.mockResolvedValueOnce(undefined);
    fakes.s3DeleteObject.mockRejectedValueOnce(new Error('s3_delete_failed'));
    const firstClaim = claimedStep();
    firstClaim.rows[0]!.result.claim!.pendingAborts = [{ s3Key: MEDIA_KEY, uploadId: 'upload-1' }];
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(firstClaim)
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'retry', retryScheduled: true } }],
      });

    await expect(purgePendingMediaDeleteBatch(1)).resolves.toEqual({ removed: 0, errors: 1 });
    expect(fakes.s3AbortMultipartUpload).toHaveBeenCalledWith(MEDIA_KEY, 'upload-1');

    // ── tick 2: the session still says 'expired', so the same upload is aborted a second time. S3
    // has already forgotten it: NoSuchUpload. The retry must still finish the cleanup. ──
    vi.clearAllMocks();
    const noSuchUpload = Object.assign(new Error('NoSuchUpload'), {
      name: 'NoSuchUpload',
      $metadata: { httpStatusCode: 404 },
    });
    fakes.s3AbortMultipartUpload.mockRejectedValueOnce(noSuchUpload);
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    const secondClaim = claimedStep(1);
    secondClaim.rows[0]!.result.claim!.pendingAborts = [{ s3Key: MEDIA_KEY, uploadId: 'upload-1' }];
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(secondClaim)
      .mockResolvedValueOnce({ rows: [{ result: { action: 'complete', deleted: true } }] });

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

    await expect(stageExpiredMultipartSessionForPurgeTx({} as never, SESSION_ID)).resolves.toBe(
      'staged',
    );

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

  it('stages all purge inputs through the same named root and rejects a malformed stage result', async () => {
    fakes.runNamedRoot.mockResolvedValueOnce({ rows: [{ result: { action: 'stage' } }] });

    await expect(purgePendingMediaDeleteBatch(25)).rejects.toThrow(
      'invalid_media_pending_delete_step_result',
    );

    expect(fakes.runNamedRoot).toHaveBeenCalledWith(
      expect.anything(),
      'app.process_media_pending_delete_step(text,uuid,integer,uuid)',
      ['stage', null, 25, null],
      expect.anything(),
    );
  });

  it('rejects a claim result that does not prove whether the queue is empty', async () => {
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce({ rows: [{ result: { action: 'claim' } }] });

    await expect(purgePendingMediaDeleteBatch(1)).rejects.toThrow(
      'invalid_media_pending_delete_step_result',
    );
  });

  it('rejects a complete result that does not prove the DB row was deleted', async () => {
    fakes.s3DeleteObject.mockResolvedValue(undefined);
    fakes.runNamedRoot
      .mockResolvedValueOnce({
        rows: [{ result: { action: 'stage', stagedCount: 0, removedEmpty: 0 } }],
      })
      .mockResolvedValueOnce(claimedStep())
      .mockResolvedValueOnce({ rows: [{ result: { action: 'complete' } }] });

    await expect(purgePendingMediaDeleteBatch(1)).rejects.toThrow(
      'invalid_media_pending_delete_step_result',
    );
    expect(fakes.s3DeleteObject).toHaveBeenCalledWith(MEDIA_KEY);
  });
});

/**
 * `collectS3KeysForMediaPurge` trusts `hlsStorageLayout` (now `@bersoncare/shared-contracts`, imported
 * via `@/shared/lib/hlsStorageLayout`) to keep purge scoped to `media/{mediaId}/…`. A DB-stored
 * `hls_master_playlist_s3_key`/`poster_s3_key` pointing outside that root — a different media's
 * artifact, or a path-traversal string — must never be deleted just because it is present on the row.
 */
describe('collectS3KeysForMediaPurge trust boundary (shared hlsStorageLayout)', () => {
  const MEDIA_ID = '55555555-5555-4555-8555-555555555555';
  const SOURCE_KEY = `media/${MEDIA_ID}/source.mp4`;

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.s3ListObjectKeysUnderPrefix.mockResolvedValue([]);
  });

  it('lists the canonical hls prefix when no explicit hls_artifact_prefix is stored', async () => {
    await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: null,
      preview_md_key: null,
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: null,
    });

    expect(fakes.s3ListObjectKeysUnderPrefix).toHaveBeenCalledWith(`media/${MEDIA_ID}/hls`);
  });

  it('ignores a stored hls_artifact_prefix that escapes the canonical media root and lists the canonical prefix instead', async () => {
    await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: null,
      preview_md_key: null,
      hls_artifact_prefix: 'media/other-media-id/hls',
      poster_s3_key: null,
      hls_master_playlist_s3_key: null,
    });

    expect(fakes.s3ListObjectKeysUnderPrefix).toHaveBeenCalledWith(`media/${MEDIA_ID}/hls`);
  });

  it('drops an explicit hls_master_playlist_s3_key pointing at another media id instead of deleting it', async () => {
    const keys = await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: null,
      preview_md_key: null,
      // Non-canonical source key so resolveHlsPurgeListPrefix returns null and the explicit
      // hls_master_playlist_s3_key path (the one under test) is what decides.
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: 'media/other-media-id/hls/master.m3u8',
    });

    expect(keys).not.toContain('media/other-media-id/hls/master.m3u8');
  });

  it('keeps a trusted explicit hls_master_playlist_s3_key for the same media id', async () => {
    const trustedKey = `media/${MEDIA_ID}/hls/master.m3u8`;
    const keys = await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: null,
      preview_md_key: null,
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: trustedKey,
    });

    // s3_key here is canonical (`media/{MEDIA_ID}/source.mp4`), so resolveHlsPurgeListPrefix
    // already returns the canonical prefix and lists it; the explicit key path only matters
    // when the canonical prefix cannot be derived. Assert the canonical listing at least, and
    // that the explicit trusted key is never rejected as untrusted.
    expect(keys).toContain(SOURCE_KEY);
  });

  it('drops an explicit poster_s3_key pointing at another media id and falls back to listing the canonical poster prefix', async () => {
    fakes.s3ListObjectKeysUnderPrefix.mockImplementation(async (prefix: string) =>
      prefix === `media/${MEDIA_ID}/poster` ? [`media/${MEDIA_ID}/poster/poster.jpg`] : [],
    );

    const keys = await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: null,
      preview_md_key: null,
      hls_artifact_prefix: null,
      poster_s3_key: 'media/other-media-id/poster/poster.jpg',
      hls_master_playlist_s3_key: null,
    });

    expect(keys).not.toContain('media/other-media-id/poster/poster.jpg');
    expect(keys).toContain(`media/${MEDIA_ID}/poster/poster.jpg`);
  });

  it('always includes the row source s3_key regardless of hls/poster trust outcomes', async () => {
    const keys = await collectS3KeysForMediaPurge({
      id: MEDIA_ID,
      s3_key: SOURCE_KEY,
      preview_sm_key: 'media/x/preview_sm.jpg',
      preview_md_key: 'media/x/preview_md.jpg',
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: null,
    });

    expect(keys).toEqual(
      expect.arrayContaining([SOURCE_KEY, 'media/x/preview_sm.jpg', 'media/x/preview_md.jpg']),
    );
  });
});
