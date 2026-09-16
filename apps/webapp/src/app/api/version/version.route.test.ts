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
    vi.doUnmock('node:fs');
  });

  /** D4: an exact restart timestamp silently exposes operational churn to every anonymous caller. */
  it('never answers with the moment the process started', async () => {
    const processStartedAt = String(Date.now());
    const answer = await readVersionResponse();

    expect(answer).not.toHaveProperty('startedAt');
    expect(answer.buildId).toEqual(expect.any(String));
    expect(answer.buildId).not.toBe(processStartedAt);
    expect(answer.buildId).not.toBe(new Date().toISOString());
  });

  /**
   * Вкладка перезагружается, когда её идентификатор сборки разошёлся с серверным. Значит два
   * процесса ОДНОЙ сборки обязаны отвечать одинаково, иначе обычный рестарт выбрасывает человека
   * из открытой страницы.
   */
  it('gives every process of one build the same answer', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, readFileSync: () => 'one-and-the-same-build\n' };
    });

    const firstProcess = await readVersionResponse();
    vi.resetModules();
    const secondProcess = await readVersionResponse();

    expect(firstProcess.buildId).toBe('one-and-the-same-build');
    expect(secondProcess.buildId).toBe(firstProcess.buildId);
  });

  it('prefers the identifier the deploy declared', async () => {
    vi.stubEnv('BUILD_ID', 'deploy-declared-id');
    const answer = await readVersionResponse();
    expect(answer.buildId).toBe('deploy-declared-id');
  });
});
