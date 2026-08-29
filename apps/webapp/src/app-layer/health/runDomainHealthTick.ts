import { env } from '@/config/env';
import {
  checkDomainCertificateHealth,
  describeDomainHealthResult,
  type DomainCertificateProbeDeps,
} from '@/modules/domain-health/domainCertificateProbe';
import { realDomainCertificateProbeDeps } from '@/modules/domain-health/realDomainCertificateProbeDeps';

export type DomainHealthTickResult = {
  checked: number;
  healthy: number;
  unhealthy: number;
  canonicalResolutionFailed: boolean;
  failures: string[];
};

function canonicalOriginHostname(): string {
  return new URL(env.APP_BASE_URL).hostname;
}

/** Daily C5 check. It records no incidents itself; the existing cron-health lifecycle owns status. */
export async function runDomainHealthTick(
  probeDeps: DomainCertificateProbeDeps = realDomainCertificateProbeDeps,
): Promise<DomainHealthTickResult> {
  const { buildAppDeps } = await import('@/app-layer/di/buildAppDeps');
  const targets = await buildAppDeps().domainHealth.listConfiguredTargets();
  if (targets.length === 0) {
    return {
      checked: 0,
      healthy: 0,
      unhealthy: 0,
      canonicalResolutionFailed: false,
      failures: [],
    };
  }

  let expectedDestinationIps: string[] = [];
  let canonicalResolutionFailed = false;
  try {
    expectedDestinationIps = await probeDeps.resolveDns(canonicalOriginHostname());
    canonicalResolutionFailed = expectedDestinationIps.length === 0;
  } catch {
    canonicalResolutionFailed = true;
  }

  const failures: string[] = [];
  let healthy = 0;
  for (const target of targets) {
    const result = await checkDomainCertificateHealth(
      target.hostname,
      expectedDestinationIps,
      probeDeps,
    );
    if (result.issues.length === 0) {
      healthy += 1;
    } else {
      failures.push(describeDomainHealthResult(result));
    }
  }

  if (canonicalResolutionFailed) {
    failures.unshift(`${canonicalOriginHostname()}: не удалось определить DNS платформы`);
  }

  return {
    checked: targets.length,
    healthy,
    unhealthy: targets.length - healthy,
    canonicalResolutionFailed,
    failures,
  };
}
