import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainHealthTickResult } from '@/app-layer/health/runDomainHealthTick';

const mocks = vi.hoisted(() => ({
  run: vi.fn<() => Promise<DomainHealthTickResult>>(),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/health/runDomainHealthTick', () => ({ runDomainHealthTick: mocks.run }));
vi.mock('@/app-layer/operator-health/recordOperatorCronJobTick', () => ({
  recordOperatorCronJobTickBestEffort: mocks.recordTick,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

function request() {
  return new Request('http://localhost/api/internal/domain-health/tick', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
}

describe('domain health tick route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing Bearer before touching the tick', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/domain-health/tick', { method: 'POST' }),
    );
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('records a degraded job and returns 500 when any configured domain is unhealthy', async () => {
    mocks.run.mockResolvedValueOnce({
      checked: 2,
      healthy: 1,
      unhealthy: 1,
      canonicalResolutionFailed: false,
      failures: ['broken.example: DNS указывает не на платформу'],
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'domain_health_failed' }),
    );
  });

  it('records success on the next healthy run, clearing the existing cron-health degradation', async () => {
    mocks.run.mockResolvedValueOnce({
      checked: 1,
      healthy: 1,
      unhealthy: 0,
      canonicalResolutionFailed: false,
      failures: [],
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, metaJson: expect.objectContaining({ unhealthy: 0 }) }),
    );
  });

  it('records an exception as failure instead of returning false green', async () => {
    mocks.run.mockRejectedValueOnce(new Error('database denied'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'database denied' }),
    );
  });
});
