import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit, stage 4): failed preview rows stay retryable,
 * but the cron route records a green tick and HTTP 200, hiding the failure from the operator.
 */

const mocks = vi.hoisted(() => ({
  processBatch: vi.fn(),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/app-layer/media/mediaPreviewWorker', () => ({
  processMediaPreviewBatch: mocks.processBatch,
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
  return new Request('http://localhost/api/internal/media-preview/process', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
}

describe('media preview tick', () => {
  it('records success only when every selected row was processed without error', async () => {
    vi.clearAllMocks();
    mocks.processBatch.mockResolvedValueOnce({ processed: 2, errors: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 2, errors: 0 });
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, metaJson: { processed: 2, errors: 0 } }),
    );
  });

  it('turns a partial batch failure into a red tick and non-2xx response', async () => {
    vi.clearAllMocks();
    mocks.processBatch.mockResolvedValueOnce({ processed: 1, errors: 2 });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, processed: 1, errors: 2 });
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, metaJson: { processed: 1, errors: 2 } }),
    );
  });
});
