import { describe, expect, it, vi } from 'vitest';
import type { JournalRetentionRunResult } from '@/modules/db-retention/journalRetention';

const mocks = vi.hoisted(() => ({
  run: vi.fn<() => Promise<JournalRetentionRunResult>>(async () => {
    throw new Error('database denied');
  }),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ dbJournalRetention: { runRetention: mocks.run } }),
}));
vi.mock('@/app-layer/operator-health/recordOperatorCronJobTick', () => ({
  recordOperatorCronJobTickBestEffort: mocks.recordTick,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

describe('db journal retention tick route', () => {
  it('rejects a missing/wrong Bearer before touching the retention sweep', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/db-journal-retention/tick', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('returns 500 instead of a false green response when the sweep fails', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/db-journal-retention/tick', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'retention_failed' });
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'database denied' }),
    );
  });

  it('reports every target result and forwards dryRun on success', async () => {
    mocks.run.mockResolvedValueOnce({
      dryRun: true,
      results: [{ target: 'app.context_nonce_ledger', deleted: 4 }],
    });

    const response = await POST(
      new Request('http://localhost/api/internal/db-journal-retention/tick?dryRun=1', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      dryRun: true,
      results: [{ target: 'app.context_nonce_ledger', deleted: 4 }],
    });
    expect(mocks.run).toHaveBeenCalledWith({ dryRun: true });
  });
});
