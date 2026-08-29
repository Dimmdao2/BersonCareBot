import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainCertificateProbeDeps } from '@/modules/domain-health/domainCertificateProbe';
import type { DomainHealthTarget } from '@/modules/domain-health/ports';

let targets: DomainHealthTarget[] = [];
const domainHealthPort = { listConfiguredTargets: vi.fn(async () => targets) };

vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ domainHealth: domainHealthPort }),
}));

const { runDomainHealthTick } = await import('@/app-layer/health/runDomainHealthTick');
const NOW = new Date('2026-08-29T00:00:00.000Z');

function healthyProbeDeps(): DomainCertificateProbeDeps {
  return {
    resolveDns: async () => ['203.0.113.10'],
    connectTls: async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }),
    now: () => NOW,
  };
}

describe('runDomainHealthTick', () => {
  beforeEach(() => {
    targets = [];
    vi.clearAllMocks();
  });

  it('returns a successful zero-target run without touching DNS', async () => {
    const deps = healthyProbeDeps();
    deps.resolveDns = vi.fn(deps.resolveDns);
    const result = await runDomainHealthTick(deps);
    expect(result).toEqual({
      checked: 0,
      healthy: 0,
      unhealthy: 0,
      canonicalResolutionFailed: false,
      failures: [],
    });
    expect(deps.resolveDns).not.toHaveBeenCalled();
  });

  it('checks every domain after one fails and returns one aggregate failure list', async () => {
    targets = [{ hostname: 'broken.example' }, { hostname: 'ok.example' }];
    const connectTls = vi.fn(async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }));
    const result = await runDomainHealthTick({
      resolveDns: async (hostname) =>
        hostname === 'broken.example' ? ['198.51.100.9'] : ['203.0.113.10'],
      connectTls,
      now: () => NOW,
    });
    expect(result.checked).toBe(2);
    expect(result.healthy).toBe(1);
    expect(result.unhealthy).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('broken.example');
    expect(connectTls).toHaveBeenCalledTimes(2);
  });

  it('fails the tick when the platform DNS cannot be established but still checks certificates', async () => {
    targets = [{ hostname: 'clinic.example' }];
    const connectTls = vi.fn(async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }));
    const result = await runDomainHealthTick({
      resolveDns: async (hostname) => {
        if (hostname === 'test.bersoncare.ru') throw new Error('ENOTFOUND');
        return ['203.0.113.10'];
      },
      connectTls,
      now: () => NOW,
    });
    expect(result.canonicalResolutionFailed).toBe(true);
    expect(result.failures[0]).toContain('test.bersoncare.ru');
    expect(connectTls).toHaveBeenCalledWith('clinic.example');
  });
});
