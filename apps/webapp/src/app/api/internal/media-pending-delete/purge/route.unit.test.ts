import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit 2026-08-27, stage 4): the media purge sweep
 * leaves rows behind because every S3 delete/abort failed, and still records a GREEN tick with
 * `errors` buried in meta — so «Здоровье системы» shows a healthy cleanup while storage leaks.
 */

const mocks = vi.hoisted(() => ({
  purge: vi.fn(),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  purgePendingMediaDeleteBatch: mocks.purge,
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
  return new Request('http://localhost/api/internal/media-pending-delete/purge', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
}

describe('media pending-delete purge tick', () => {
  it('reports success only when nothing failed', async () => {
    vi.clearAllMocks();
    mocks.purge.mockResolvedValueOnce({ removed: 3, errors: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, removed: 3, errors: 0 });
    expect(mocks.recordTick).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('turns a partial sweep into a red tick instead of a green one with errors in meta', async () => {
    vi.clearAllMocks();
    mocks.purge.mockResolvedValueOnce({ removed: 1, errors: 2 });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, removed: 1, errors: 2 });
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, metaJson: { removed: 1, errors: 2 } }),
    );
  });
});
