import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit 2026-08-27, stage 4): a reconcile batch can fail to
 * enqueue part of the media library while returning HTTP 200 and writing a green operator tick. The
 * scheduler then reports a healthy job although some videos will never enter processing.
 */

const mocks = vi.hoisted(() => ({
  env: { INTERNAL_JOB_SECRET: 'test-secret' as string | undefined },
  backfill: vi.fn(),
  getConfigBool: vi.fn(async () => true),
  recordSuccess: vi.fn(async () => undefined),
  recordFailure: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: mocks.env }));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app-layer/media/videoHlsLegacyBackfill', () => ({
  runVideoHlsLegacyBackfill: mocks.backfill,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES: 3_221_225_472,
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigBool: mocks.getConfigBool,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    operatorHealthWrite: {
      recordMediaTranscodeReconcileSuccess: mocks.recordSuccess,
      recordMediaTranscodeReconcileFailure: mocks.recordFailure,
    },
  }),
}));
vi.mock('@bersoncare/db-principal', () => ({ enterWithDbInfraPrincipal: vi.fn() }));

import { POST } from './route';

function request(): Request {
  return new Request('http://localhost/api/internal/media-transcode/reconcile', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 50 }),
  });
}

function report(errors: number, abortedReason: string | null = null) {
  return {
    dryRun: false,
    pipelineEnabled: true,
    abortedReason,
    batches: 1,
    candidatesScanned: 3,
    skippedOversized: 0,
    skippedPipelineOff: 0,
    enqueue: { queuedNew: 1, alreadyQueued: 0, alreadyReady: 0, errors },
    lastMediaId: null,
    statusHistogram: {},
    failedReasons: {},
  };
}

describe('media transcode reconcile result', () => {
  it('returns and records success only when every required enqueue succeeded', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = 'test-secret';
    mocks.backfill.mockResolvedValueOnce(report(0));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, report: { enqueue: { errors: 0 } } });
    expect(mocks.recordSuccess).toHaveBeenCalledOnce();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it('turns partial enqueue errors into a failed HTTP result and a red operator tick', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = 'test-secret';
    mocks.backfill.mockResolvedValueOnce(report(2));

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'reconcile_partial_failure',
      report: { enqueue: { errors: 2 } },
    });
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'enqueue_errors:2',
        metaJson: expect.objectContaining({ enqueueErrors: 2 }),
      }),
    );
  });

  it('treats an aborted reconcile as a failure even when no enqueue call errored', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = 'test-secret';
    mocks.backfill.mockResolvedValueOnce(report(0, 'cursor_invalidated'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'reconcile_partial_failure',
      report: { abortedReason: 'cursor_invalidated' },
    });
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'cursor_invalidated',
        metaJson: expect.objectContaining({
          abortedReason: 'cursor_invalidated',
          enqueueErrors: 0,
          queuedNew: 1,
          candidatesScanned: 3,
        }),
      }),
    );
  });

  it('does not disguise a missing runtime secret as an accepted feature-disabled response', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = undefined;

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_configured' });
    expect(mocks.backfill).not.toHaveBeenCalled();
  });

  it('keeps a completed reconcile successful when only the secondary success tick write fails', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = 'test-secret';
    mocks.backfill.mockResolvedValueOnce(report(0));
    mocks.recordSuccess.mockRejectedValueOnce(new Error('operator health unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, report: { enqueue: { errors: 0 } } });
    expect(mocks.recordSuccess).toHaveBeenCalledOnce();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it('turns a backfill exception into a failed HTTP result and failure tick', async () => {
    vi.clearAllMocks();
    mocks.env.INTERNAL_JOB_SECRET = 'test-secret';
    mocks.backfill.mockRejectedValueOnce(new Error('queue unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'reconcile_failed' });
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'queue unavailable', metaJson: {} }),
    );
  });
});
