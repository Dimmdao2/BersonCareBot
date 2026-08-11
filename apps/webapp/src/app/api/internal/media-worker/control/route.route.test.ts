import { beforeEach, describe, expect, it, vi } from 'vitest';

const control = {
  assertMediaWorkerControlReady: vi.fn(), claimMediaWorkerControlJob: vi.fn(),
  completeMediaWorkerHlsJob: vi.fn(), completeMediaWorkerProgramJob: vi.fn(),
  failMediaWorkerJob: vi.fn(), loadMediaWorkerControlMedia: vi.fn(), markMediaWorkerProcessing: vi.fn(),
  readMediaWorkerWatermarkEnabled: vi.fn(), retryMediaWorkerJob: vi.fn(),
};
vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'control-secret' } }));
vi.mock('@/app-layer/media/mediaWorkerControl', () => control);
vi.mock('@bersoncare/db-principal', () => ({ enterWithDbInfraPrincipal: vi.fn() }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
const { POST } = await import('./route');

describe('POST /api/internal/media-worker/control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an unauthorized request before it can call the DB control seam', async () => {
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer wrong' }, body: JSON.stringify({ type: 'ready' }),
    }));
    expect(response.status).toBe(401);
    expect(control.assertMediaWorkerControlReady).not.toHaveBeenCalled();
  });

  it('dispatches the authenticated narrow ready command', async () => {
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' }, body: JSON.stringify({ type: 'ready' }),
    }));
    expect(response.status).toBe(200);
    expect(control.assertMediaWorkerControlReady).toHaveBeenCalledOnce();
  });
});
