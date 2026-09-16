import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

async function readVersionResponse(): Promise<Record<string, unknown>> {
  const { GET } = await import('./route');
  const response = await GET(new Request('http://test.local/api/version'));
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe('GET /api/version', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T10:11:12.345Z'));
    vi.stubEnv('BUILD_ID', '');
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** D4: an exact restart timestamp silently exposes operational churn to every anonymous caller. */
  it('uses an opaque stable process id without exposing process start time', async () => {
    const processStartedAt = String(Date.now());
    const first = await readVersionResponse();
    const second = await readVersionResponse();

    expect(first).not.toHaveProperty('startedAt');
    expect(first.buildId).toEqual(expect.any(String));
    expect(first.buildId).not.toBe(processStartedAt);
    expect(second.buildId).toBe(first.buildId);

    vi.resetModules();
    const nextProcess = await readVersionResponse();
    expect(nextProcess.buildId).not.toBe(first.buildId);
  });
});
