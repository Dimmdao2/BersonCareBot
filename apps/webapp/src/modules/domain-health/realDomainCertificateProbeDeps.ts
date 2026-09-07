/**
 * C5: the only place in the repo that speaks `node:dns`/`node:tls` for domain/certificate health.
 * Kept separate from `domainCertificateProbe.ts` so that file stays pure and injectable; only
 * `runDomainHealthTick.ts` (the production orchestrator) imports this module.
 */
import { promises as dns } from 'node:dns';
import { connect as tlsConnect } from 'node:tls';
import {
  CUSTOM_DOMAIN_ROUTING_PROBE_ID,
  CUSTOM_DOMAIN_ROUTING_PROBE_PATH,
  type DomainCertificateProbeDeps,
} from '@/modules/domain-health/domainCertificateProbe';

const DNS_TIMEOUT_MS = 8_000;
const TLS_TIMEOUT_MS = 8_000;
const TLS_PORT = 443;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Resolves both address families; tolerates either family having no records (ENODATA/ENOTFOUND). */
export async function resolveHostnameIps(hostname: string): Promise<string[]> {
  const settled = await Promise.allSettled([
    withTimeout(dns.resolve4(hostname), DNS_TIMEOUT_MS, 'dns'),
    withTimeout(dns.resolve6(hostname), DNS_TIMEOUT_MS, 'dns'),
  ]);
  const ips = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  if (ips.length === 0) {
    const firstError = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstError ? (firstError.reason as Error) : new Error('no_dns_records');
  }
  return ips;
}

export async function resolveHostnameCnames(hostname: string): Promise<string[]> {
  return withTimeout(dns.resolveCname(hostname), DNS_TIMEOUT_MS, 'dns_cname');
}

/** Normal validated handshake (`rejectUnauthorized: true`) — an untrusted/self-signed cert fails here. */
export function connectTlsAndReadCertificate(hostname: string): Promise<{ notAfter: Date }> {
  return new Promise<{ notAfter: Date }>((resolve, reject) => {
    const socket = tlsConnect(
      {
        host: hostname,
        servername: hostname,
        port: TLS_PORT,
        rejectUnauthorized: true,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();
        if (!certificate || !certificate.valid_to) {
          reject(new Error('no_peer_certificate'));
          return;
        }
        resolve({ notAfter: new Date(certificate.valid_to) });
      },
    );
    socket.setTimeout(TLS_TIMEOUT_MS, () => socket.destroy(new Error('tls_timeout')));
    socket.once('error', reject);
  });
}

export async function probeExactWebappRoute(hostname: string): Promise<void> {
  const response = await withTimeout(
    fetch(`https://${hostname}${CUSTOM_DOMAIN_ROUTING_PROBE_PATH}`, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
    }),
    TLS_TIMEOUT_MS,
    'routing_probe',
  );
  if (response.status !== 200) throw new Error(`unexpected_status_${response.status}`);
  const body = (await response.json()) as unknown;
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    (body as Record<string, unknown>).probe !== CUSTOM_DOMAIN_ROUTING_PROBE_ID ||
    (body as Record<string, unknown>).host !== hostname
  ) {
    throw new Error('unexpected_probe_response');
  }
}

export const realDomainCertificateProbeDeps: DomainCertificateProbeDeps = {
  resolveDns: resolveHostnameIps,
  resolveCname: resolveHostnameCnames,
  connectTls: connectTlsAndReadCertificate,
  probeRouting: probeExactWebappRoute,
  now: () => new Date(),
};
