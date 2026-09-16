import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const originalCwd = process.cwd();
  let buildRoot: string;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T10:11:12.345Z'));
    vi.stubEnv('BUILD_ID', '');
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', '');
    vi.stubEnv('SESSION_COOKIE_SECRET', 'route-test-session-secret-min-16');
    buildRoot = mkdtempSync(join(tmpdir(), 'bcb-version-route-'));
    mkdirSync(join(buildRoot, '.next'));
    writeFileSync(join(buildRoot, '.next', 'BUILD_ID'), 'opaque-next-build-a\n', 'utf8');
    process.chdir(buildRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(buildRoot, { recursive: true, force: true });
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** D4: exact process/build timestamps silently expose operational churn to every anonymous caller. */
  it('never exposes the process start or host build identity', async () => {
    const processStartedAt = String(Date.now());
    const privateGitSha = '74c4986';
    const privateBuildEpoch = '1789553400';
    vi.stubEnv('BUILD_ID', `${privateGitSha}-${privateBuildEpoch}`);
    const answer = await readVersionResponse();

    expect(answer).not.toHaveProperty('startedAt');
    expect(answer.buildId).toEqual(expect.any(String));
    expect(answer.buildId).not.toBe(processStartedAt);
    expect(answer.buildId).not.toBe(new Date().toISOString());
    expect(answer.buildId).not.toBe(`${privateGitSha}-${privateBuildEpoch}`);
    expect(answer.buildId).not.toContain(privateGitSha);
    expect(answer.buildId).not.toContain(privateBuildEpoch);
  });

  /**
   * Вкладка перезагружается, когда её идентификатор сборки разошёлся с серверным. Значит два
   * процесса ОДНОЙ сборки обязаны отвечать одинаково, иначе обычный рестарт выбрасывает человека
   * из открытой страницы.
   */
  it('gives every process of one build the same answer', async () => {
    const firstProcess = await readVersionResponse();
    vi.resetModules();
    const secondProcess = await readVersionResponse();

    expect(secondProcess.buildId).toBe(firstProcess.buildId);
  });

  it('prefers the identifier the deploy declared', async () => {
    vi.stubEnv('BUILD_ID', 'deploy-declared-private-id');
    const withFirstNearbyFile = await readVersionResponse();

    writeFileSync(join(buildRoot, '.next', 'BUILD_ID'), 'opaque-next-build-b\n', 'utf8');
    vi.resetModules();
    const withSecondNearbyFile = await readVersionResponse();

    vi.stubEnv('BUILD_ID', '');
    vi.resetModules();
    const fromNearbyFile = await readVersionResponse();

    expect(withSecondNearbyFile.buildId).toBe(withFirstNearbyFile.buildId);
    expect(fromNearbyFile.buildId).not.toBe(withFirstNearbyFile.buildId);
  });
});
