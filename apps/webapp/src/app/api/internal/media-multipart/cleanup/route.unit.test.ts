import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit 2026-08-27 §D1 + stage 4):
 *  1. the tick deletes `media_files` — and with it, by cascade, the `media_upload_sessions` row that
 *     is the ONLY holder of `s3_key` + `upload_id` — before the S3 abort is confirmed, so a failed
 *     abort can never be retried and the parts stay in the bucket unnamed;
 *  2. a row that fails is pushed into a terminal `expired` state the selector never looks at again;
 *  3. `errors > 0` is still reported as a successful tick, so the operator sees green.
 *
 * ORACLE: the audit finding and stage 4 of its plan ("успех batch-job возможен только когда все
 * обязательные операции завершены"), not the implementation.
 */

const mocks = vi.hoisted(() => ({
  listExpired: vi.fn(),
  stage: vi.fn(),
  withLock: vi.fn(),
  recordTick: vi.fn(async () => undefined),
  loggerError: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.loggerError },
}));
vi.mock('@/app-layer/locks/multipartSessionLock', () => ({
  withMultipartSessionLock: mocks.withLock,
}));
vi.mock('@/app-layer/media/mediaUploadSessionsRepo', () => ({
  listExpiredActiveUploadSessions: mocks.listExpired,
  stageExpiredMultipartSessionForPurgeTx: mocks.stage,
}));
vi.mock('@/app-layer/operator-health/recordOperatorCronJobTick', () => ({
  recordOperatorCronJobTickBestEffort: mocks.recordTick,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

function request(): Request {
  return new Request('http://localhost/api/internal/media-multipart/cleanup', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
}

describe('media multipart cleanup tick', () => {
  it('hands expired sessions to the pending-delete lifecycle and calls no S3 abort itself', async () => {
    vi.clearAllMocks();
    mocks.listExpired.mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }]);
    mocks.withLock.mockImplementation(
      async (_pool: unknown, _id: string, fn: (c: unknown) => Promise<unknown>) => fn({}),
    );
    mocks.stage.mockResolvedValueOnce('staged').mockResolvedValueOnce('session_only');

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, cleaned: 2, errors: 0 });
    expect(mocks.stage).toHaveBeenCalledTimes(2);
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, metaJson: { cleaned: 2, errors: 0 } }),
    );
  });

  it('fails the tick when a row fails, and leaves that row selectable for the next run', async () => {
    vi.clearAllMocks();
    mocks.listExpired.mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }]);
    mocks.withLock.mockImplementation(
      async (_pool: unknown, _id: string, fn: (c: unknown) => Promise<unknown>) => fn({}),
    );
    mocks.stage
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce('staged');

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, cleaned: 1, errors: 1 });
    // errors > 0 must never be recorded as a successful tick
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, metaJson: { cleaned: 1, errors: 1 } }),
    );
    // ...and the failing row was NOT forced into a terminal state to make the loop look clean:
    // only the two staging calls happened, no compensating "mark expired" write.
    expect(mocks.stage).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it('rejects a wrong Bearer before listing anything', async () => {
    vi.clearAllMocks();
    const response = await POST(
      new Request('http://localhost/api/internal/media-multipart/cleanup', { method: 'POST' }),
    );
    expect(response.status).toBe(401);
    expect(mocks.listExpired).not.toHaveBeenCalled();
  });
});
