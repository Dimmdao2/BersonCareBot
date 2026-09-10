const RENEWAL_WARNING_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const CUSTOM_DOMAIN_ROUTING_PROBE_PATH = '/api/public/domains/probe';
export const CUSTOM_DOMAIN_ROUTING_PROBE_ID = 'therapygo-custom-domain-routing-v1';

export type DomainCertificateProbeDeps = {
  resolveDns(hostname: string): Promise<string[]>;
  resolveCname?(hostname: string): Promise<string[]>;
  connectTls(hostname: string): Promise<{ notAfter: Date }>;
  probeRouting?(hostname: string): Promise<void>;
  now(): Date;
};

export type DomainLifecycleExpectation = Readonly<
  | { placement: 'apex'; edgeIp: string }
  | { placement: 'subdomain'; edgeIp: string; cnameTarget?: string }
  | { placement: 'subdomain'; edgeIp?: string; cnameTarget: string }
>;

export type DomainHealthIssue =
  | { code: 'resolution_failed'; detail: string }
  | { code: 'dns_mismatch'; detail: string }
  | { code: 'tls_handshake_failed'; detail: string }
  | { code: 'routing_probe_failed'; detail: string }
  | { code: 'cert_expired'; detail: string }
  | { code: 'cert_expiring_soon'; detail: string };

export type DomainHealthCheckResult = {
  hostname: string;
  resolved: string[];
  expiresInDays: number | null;
  dnsReady: boolean;
  tlsReady: boolean;
  routingReady: boolean;
  issues: DomainHealthIssue[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCnameTarget(value: string): string {
  return value.replace(/\.$/u, '').toLowerCase();
}

function hasExactEdgeAnswer(resolved: readonly string[], edgeIp: string | undefined): boolean {
  return Boolean(edgeIp && resolved.length === 1 && resolved[0] === edgeIp);
}

/** Checks DNS and TLS independently so one failed half never hides the other. */
export async function checkDomainCertificateHealth(
  hostname: string,
  expectedDestinationIps: readonly string[],
  deps: DomainCertificateProbeDeps,
  lifecycleExpectation?: DomainLifecycleExpectation,
): Promise<DomainHealthCheckResult> {
  const issues: DomainHealthIssue[] = [];
  let resolved: string[] = [];
  let expiresInDays: number | null = null;
  let dnsReady = false;
  let tlsReady = false;
  let routingReady = false;

  if (lifecycleExpectation?.placement === 'subdomain') {
    let addressResolutionError: string | null = null;
    try {
      resolved = await deps.resolveDns(hostname);
    } catch (error) {
      addressResolutionError = errorMessage(error);
    }

    // A valid direct edge record is sufficient; an absent CNAME is normal in that configuration.
    if (hasExactEdgeAnswer(resolved, lifecycleExpectation.edgeIp)) {
      dnsReady = true;
    } else if (!lifecycleExpectation.cnameTarget) {
      if (addressResolutionError) {
        issues.push({ code: 'resolution_failed', detail: addressResolutionError });
      } else if (resolved.length === 0) {
        issues.push({ code: 'resolution_failed', detail: 'empty_answer' });
      } else {
        issues.push({ code: 'dns_mismatch', detail: resolved.join(',') });
      }
    } else if (!deps.resolveCname) {
      issues.push({
        code: 'resolution_failed',
        detail: addressResolutionError ?? 'cname_probe_unavailable',
      });
    } else {
      try {
        const expected = normalizeCnameTarget(lifecycleExpectation.cnameTarget);
        const aliases = (await deps.resolveCname(hostname)).map(normalizeCnameTarget);
        if (aliases.includes(expected)) {
          dnsReady = true;
        } else if (addressResolutionError && aliases.length === 0) {
          issues.push({ code: 'resolution_failed', detail: addressResolutionError });
        } else if (resolved.length === 0 && aliases.length === 0) {
          issues.push({ code: 'resolution_failed', detail: 'empty_answer' });
        } else {
          issues.push({
            code: 'dns_mismatch',
            detail: aliases.join(',') || resolved.join(',') || 'empty_cname_answer',
          });
        }
      } catch (error) {
        if (addressResolutionError) {
          issues.push({ code: 'resolution_failed', detail: addressResolutionError });
        } else {
          issues.push({
            code: 'dns_mismatch',
            detail: resolved.join(',') || errorMessage(error),
          });
        }
      }
    }
  } else {
    try {
      resolved = await deps.resolveDns(hostname);
      if (resolved.length === 0) {
        issues.push({ code: 'resolution_failed', detail: 'empty_answer' });
      } else if (lifecycleExpectation?.placement === 'apex') {
        if (!hasExactEdgeAnswer(resolved, lifecycleExpectation.edgeIp)) {
          issues.push({ code: 'dns_mismatch', detail: resolved.join(',') });
        } else {
          dnsReady = true;
        }
      } else if (
        expectedDestinationIps.length > 0 &&
        !resolved.some((ip) => expectedDestinationIps.includes(ip))
      ) {
        issues.push({ code: 'dns_mismatch', detail: resolved.join(',') });
      } else {
        dnsReady = true;
      }
    } catch (error) {
      issues.push({ code: 'resolution_failed', detail: errorMessage(error) });
    }
  }

  // Lifecycle activation is deliberately ordered. DNS mismatch must never reach Caddy/TLS.
  if (lifecycleExpectation && !dnsReady) {
    return { hostname, resolved, expiresInDays, dnsReady, tlsReady, routingReady, issues };
  }

  try {
    const certificate = await deps.connectTls(hostname);
    tlsReady = true;
    const remainingMs = certificate.notAfter.getTime() - deps.now().getTime();
    expiresInDays = Math.floor(remainingMs / MS_PER_DAY);
    if (remainingMs < 0) {
      issues.push({ code: 'cert_expired', detail: String(Math.abs(expiresInDays)) });
    } else if (expiresInDays <= RENEWAL_WARNING_WINDOW_DAYS) {
      issues.push({ code: 'cert_expiring_soon', detail: String(expiresInDays) });
    }
  } catch (error) {
    issues.push({ code: 'tls_handshake_failed', detail: errorMessage(error) });
  }

  // A trusted certificate is necessary but insufficient: prove the exact Host through the edge,
  // nginx and webapp using the one constant public probe response.
  if (lifecycleExpectation && tlsReady) {
    if (!deps.probeRouting) {
      issues.push({ code: 'routing_probe_failed', detail: 'routing_probe_unavailable' });
    } else {
      try {
        await deps.probeRouting(hostname);
        routingReady = true;
      } catch (error) {
        issues.push({ code: 'routing_probe_failed', detail: errorMessage(error) });
      }
    }
  }

  return { hostname, resolved, expiresInDays, dnsReady, tlsReady, routingReady, issues };
}

export function describeDomainHealthResult(result: DomainHealthCheckResult): string {
  return result.issues
    .map((issue) => {
      switch (issue.code) {
        case 'resolution_failed':
          return `${result.hostname}: DNS не резолвится (${issue.detail})`;
        case 'dns_mismatch':
          return `${result.hostname}: DNS указывает не на платформу (${issue.detail})`;
        case 'tls_handshake_failed':
          return `${result.hostname}: TLS не прошёл проверку (${issue.detail})`;
        case 'routing_probe_failed':
          return `${result.hostname}: маршрут edge→nginx→webapp не подтверждён (${issue.detail})`;
        case 'cert_expired':
          return `${result.hostname}: сертификат истёк (${issue.detail} дн.)`;
        case 'cert_expiring_soon':
          return `${result.hostname}: сертификат истекает через ${issue.detail} дн.`;
      }
    })
    .join('; ');
}
