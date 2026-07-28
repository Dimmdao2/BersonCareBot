import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envHolder, recordTickSuccess, getJobStatus } = vi.hoisted(() => ({
  envHolder: { INTERNAL_JOB_SECRET: 'test-internal-secret' as string | undefined },
  recordTickSuccess: vi.fn(),
  getJobStatus: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: envHolder }));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  enterWithDbInfraPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    operatorHealthWrite: { recordOperatorJobTickSuccess: recordTickSuccess },
    operatorHealthRead: { getOperatorJobStatus: getJobStatus },
  }),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn().mockResolvedValue(''),
}));

import { GET, POST } from './route';

const URL_ = 'http://localhost/api/internal/heartbeat/pipeline_delivery';

describe("POST /api/internal/heartbeat/pipeline_delivery — dead man's switch receiver", () => {
  beforeEach(() => {
    recordTickSuccess.mockReset().mockResolvedValue(undefined);
    getJobStatus.mockReset().mockResolvedValue(null);
    envHolder.INTERNAL_JOB_SECRET = 'test-internal-secret';
  });

  it('refuses an unauthenticated ping so nobody can forge a heartbeat', async () => {
    const res = await POST(new Request(URL_, { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(recordTickSuccess).not.toHaveBeenCalled();
  });

  it('refuses every ping while the secret is unset, rather than accepting silently', async () => {
    envHolder.INTERNAL_JOB_SECRET = '';
    const res = await POST(
      new Request(URL_, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-internal-secret' },
      }),
    );
    expect(res.status).toBe(503);
    expect(recordTickSuccess).not.toHaveBeenCalled();
  });

  it('records an authorised ping against the pipeline heartbeat key', async () => {
    const res = await POST(
      new Request(URL_, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-internal-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; heartbeat: string; receivedAt: string };
    expect(body.ok).toBe(true);
    expect(body.heartbeat).toBe('pipeline_delivery');
    expect(recordTickSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ jobFamily: 'heartbeat', jobKey: 'heartbeat.pipeline_delivery' }),
    );
  });

  it('does not report success when the ping could not be stored', async () => {
    recordTickSuccess.mockRejectedValue(new Error('db down'));
    const res = await POST(
      new Request(URL_, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-internal-secret' },
      }),
    );
    expect(res.status).toBe(500);
  });

  it('GET reports the heartbeat as never-seen when no ping was ever stored', async () => {
    const res = await GET(
      new Request(URL_, { headers: { Authorization: 'Bearer test-internal-secret' } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: { status: string } };
    expect(body.verdict.status).toBe('never');
  });

  it('GET reports the heartbeat as absent once the window has passed', async () => {
    getJobStatus.mockResolvedValue({
      lastSuccessAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      metaJson: {},
    });
    const res = await GET(
      new Request(URL_, { headers: { Authorization: 'Bearer test-internal-secret' } }),
    );
    const body = (await res.json()) as { verdict: { status: string } };
    expect(body.verdict.status).toBe('absent');
  });

  it('GET reports the heartbeat as alive right after a ping', async () => {
    getJobStatus.mockResolvedValue({ lastSuccessAt: new Date().toISOString(), metaJson: {} });
    const res = await GET(
      new Request(URL_, { headers: { Authorization: 'Bearer test-internal-secret' } }),
    );
    const body = (await res.json()) as { verdict: { status: string } };
    expect(body.verdict.status).toBe('alive');
  });
});
