const RENEWAL_WARNING_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DomainCertificateProbeDeps = {
  resolveDns(hostname: string): Promise<string[]>;
  connectTls(hostname: string): Promise<{ notAfter: Date }>;
  now(): Date;
};

export type DomainHealthIssue =
  | { code: 'resolution_failed'; detail: string }
  | { code: 'dns_mismatch'; detail: string }
  | { code: 'tls_handshake_failed'; detail: string }
  | { code: 'cert_expired'; detail: string }
  | { code: 'cert_expiring_soon'; detail: string };

export type DomainHealthCheckResult = {
  hostname: string;
  resolved: string[];
  expiresInDays: number | null;
  issues: DomainHealthIssue[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Checks DNS and TLS independently so one failed half never hides the other. */
export async function checkDomainCertificateHealth(
  hostname: string,
  expectedDestinationIps: readonly string[],
  deps: DomainCertificateProbeDeps,
): Promise<DomainHealthCheckResult> {
  const issues: DomainHealthIssue[] = [];
  let resolved: string[] = [];
  let expiresInDays: number | null = null;

  try {
    resolved = await deps.resolveDns(hostname);
    if (resolved.length === 0) {
      issues.push({ code: 'resolution_failed', detail: 'empty_answer' });
    } else if (
      expectedDestinationIps.length > 0 &&
      !resolved.some((ip) => expectedDestinationIps.includes(ip))
    ) {
      issues.push({ code: 'dns_mismatch', detail: resolved.join(',') });
    }
  } catch (error) {
    issues.push({ code: 'resolution_failed', detail: errorMessage(error) });
  }

  try {
    const certificate = await deps.connectTls(hostname);
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

  return { hostname, resolved, expiresInDays, issues };
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
        case 'cert_expired':
          return `${result.hostname}: сертификат истёк (${issue.detail} дн.)`;
        case 'cert_expiring_soon':
          return `${result.hostname}: сертификат истекает через ${issue.detail} дн.`;
      }
    })
    .join('; ');
}
