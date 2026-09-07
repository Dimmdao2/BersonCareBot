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

  it('does not let matching TLS or routing evidence override a mixed apex DNS answer', async () => {
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      [],
      fakeDeps({
        resolveDns: async () => ['203.0.113.10', '198.51.100.5'],
        probeRouting: async () => undefined,
      }),
      { placement: 'apex', edgeIp: '203.0.113.10' },
    );

    expect(result).toMatchObject({ dnsReady: false, tlsReady: false, routingReady: false });
    expect(result.issues).toContainEqual({
      code: 'dns_mismatch',
      detail: '203.0.113.10,198.51.100.5',
    });
  });

  it('does not accept exact routing when the managed TLS handshake fails', async () => {
    const result = await checkDomainCertificateHealth(
      'app.clinic.example',
      [],
      fakeDeps({
        resolveCname: async () => ['edge.therapygo.ru.'],
        connectTls: async () => {
          throw new Error('CERT_UNTRUSTED');
        },
        probeRouting: async () => undefined,
      }),
      { placement: 'subdomain', cnameTarget: 'edge.therapygo.ru' },
    );

    expect(result).toMatchObject({ dnsReady: true, tlsReady: false, routingReady: false });
    expect(result.issues).toContainEqual({
      code: 'tls_handshake_failed',
      detail: 'CERT_UNTRUSTED',
    });
  });

  it('accepts lifecycle readiness only after DNS, trusted TLS and exact routing all succeed', async () => {
    const result = await checkDomainCertificateHealth(
      'clinic.example',
      [],
      fakeDeps({ probeRouting: async () => undefined }),
      { placement: 'apex', edgeIp: '203.0.113.10' },
    );

    expect(result).toMatchObject({ dnsReady: true, tlsReady: true, routingReady: true });
    expect(result.issues).toEqual([]);
  });
});
