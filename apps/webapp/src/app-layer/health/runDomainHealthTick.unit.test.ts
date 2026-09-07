import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainHealthTarget } from '@/modules/domain-health/ports';

let targets: DomainHealthTarget[] = [];
const domainHealthPort = { listConfiguredTargets: vi.fn(async () => targets) };
let lifecycleEnabled = false;
let lifecycleEligible = true;
let persistedStatus: NonNullable<DomainHealthTarget['status']> = 'pending';
const customDomainBinding = {
  isBindingLifecycleEligible: vi.fn(async () => lifecycleEligible),
  transitionBindingStatus: vi.fn(
    async (input: {
      transition: 'mark_dns_ready' | 'mark_active' | 'mark_failed' | 'mark_suspended';
    }) => {
      persistedStatus =
        input.transition === 'mark_dns_ready'
          ? 'dns_ready'
          : input.transition === 'mark_active'
            ? 'active'
            : input.transition === 'mark_failed'
              ? 'failed'
              : 'suspended';
      return { ok: true as const };
    },
  ),
};

vi.mock('@/config/env', () => ({
  env: {
    APP_BASE_URL: 'https://test.bersoncare.ru',
    CUSTOM_DOMAIN_EDGE_IP: '203.0.113.10',
    CUSTOM_DOMAIN_CNAME_TARGET: 'edge.therapygo.test',
  },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    domainHealth: domainHealthPort,
    ...(lifecycleEnabled ? { customDomainBinding } : {}),
  }),
}));

const { runDomainHealthTick } = await import('@/app-layer/health/runDomainHealthTick');
const NOW = new Date('2026-08-29T00:00:00.000Z');

describe('runDomainHealthTick', () => {
  beforeEach(() => {
    targets = [];
    lifecycleEnabled = false;
    lifecycleEligible = true;
    persistedStatus = 'pending';
    vi.clearAllMocks();
  });

  it('checks every domain after one fails and returns one aggregate failure list', async () => {
    targets = [{ hostname: 'broken.example' }, { hostname: 'ok.example' }];
    const result = await runDomainHealthTick({
      resolveDns: async (hostname) =>
        hostname === 'broken.example' ? ['198.51.100.9'] : ['203.0.113.10'],
      connectTls: async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }),
      now: () => NOW,
    });
    expect(result.checked).toBe(2);
    expect(result.healthy).toBe(1);
    expect(result.unhealthy).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('broken.example');
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

  it('activates a canonical binding only after the complete readiness proof succeeds', async () => {
    lifecycleEnabled = true;
    targets = [
      {
        hostname: 'clinic.example',
        organizationId: '11111111-1111-4111-8111-111111111111',
        baseDomain: 'clinic.example',
        placement: 'apex',
        status: 'pending',
        organizationActive: true,
        hasPublishedBrand: true,
      },
    ];

    const result = await runDomainHealthTick({
      resolveDns: async () => ['203.0.113.10'],
      connectTls: async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }),
      probeRouting: async () => undefined,
      now: () => NOW,
    });

    expect(result).toMatchObject({ checked: 1, healthy: 1, unhealthy: 0, failures: [] });
    expect(persistedStatus).toBe('active');
  });

  it('removes an active custom binding when exact routing later fails', async () => {
    lifecycleEnabled = true;
    persistedStatus = 'active';
    targets = [
      {
        hostname: 'clinic.example',
        organizationId: '11111111-1111-4111-8111-111111111111',
        baseDomain: 'clinic.example',
        placement: 'apex',
        status: 'active',
        organizationActive: true,
        hasPublishedBrand: true,
      },
    ];

    const result = await runDomainHealthTick({
      resolveDns: async () => ['203.0.113.10'],
      connectTls: async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }),
      probeRouting: async () => {
        throw new Error('wrong_upstream');
      },
      now: () => NOW,
    });

    expect(result).toMatchObject({ checked: 1, healthy: 0, unhealthy: 1 });
    expect(result.failures[0]).toContain('edge→nginx→webapp');
    expect(persistedStatus).toBe('failed');
  });

  it('suspends a formerly active binding as soon as lifecycle eligibility is lost', async () => {
    lifecycleEnabled = true;
    lifecycleEligible = false;
    persistedStatus = 'active';
    targets = [
      {
        hostname: 'clinic.example',
        organizationId: '11111111-1111-4111-8111-111111111111',
        baseDomain: 'clinic.example',
        placement: 'apex',
        status: 'active',
        organizationActive: true,
        hasPublishedBrand: true,
      },
    ];

    const result = await runDomainHealthTick({
      resolveDns: async () => {
        throw new Error('network_must_not_run');
      },
      connectTls: async () => {
        throw new Error('network_must_not_run');
      },
      now: () => NOW,
    });

    expect(result).toMatchObject({ checked: 1, healthy: 0, unhealthy: 1 });
    expect(persistedStatus).toBe('suspended');
  });
});
