import { describe, expect, it, vi } from 'vitest';
import {
  checkDomainCertificateHealth,
  type DomainCertificateProbeDeps,
} from '@/modules/domain-health/domainCertificateProbe';

const NOW = new Date('2026-08-29T00:00:00.000Z');

function fakeDeps(overrides: Partial<DomainCertificateProbeDeps> = {}): DomainCertificateProbeDeps {
  return {
    resolveDns: async () => ['203.0.113.10'],
    connectTls: async () => ({ notAfter: new Date('2026-12-01T00:00:00.000Z') }),
    now: () => NOW,
    ...overrides,
  };
}

describe('checkDomainCertificateHealth', () => {
  it('accepts matching DNS and a certificate outside the renewal window', async () => {
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      ['203.0.113.10'],
      fakeDeps(),
    );
    expect(result.issues).toEqual([]);
    expect(result.expiresInDays).toBeGreaterThan(30);
  });

  it('reports both a DNS mismatch and TLS failure instead of hiding the second check', async () => {
    const connectTls = vi.fn(async () => {
      throw new Error('CERT_HAS_EXPIRED');
    });
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      ['203.0.113.10'],
      fakeDeps({ resolveDns: async () => ['198.51.100.5'], connectTls }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'dns_mismatch',
      'tls_handshake_failed',
    ]);
    expect(connectTls).toHaveBeenCalledWith('clinic.example');
  });

  it('reports DNS resolution failure', async () => {
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      ['203.0.113.10'],
      fakeDeps({
        resolveDns: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    );
    expect(result.issues).toContainEqual({ code: 'resolution_failed', detail: 'ENOTFOUND' });
  });

  it('warns throughout the conservative 30-day renewal window', async () => {
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      ['203.0.113.10'],
      fakeDeps({ connectTls: async () => ({ notAfter: new Date('2026-09-28T00:00:00.000Z') }) }),
    );
    expect(result.issues).toContainEqual({ code: 'cert_expiring_soon', detail: '30' });
  });
});
