import { env } from '@/config/env';
import {
  checkDomainCertificateHealth,
  describeDomainHealthResult,
  type DomainCertificateProbeDeps,
  type DomainLifecycleExpectation,
} from '@/modules/domain-health/domainCertificateProbe';
import type { DomainHealthTarget } from '@/modules/domain-health/ports';
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

type CanonicalLifecycleTarget = DomainHealthTarget & {
  organizationId: string;
  baseDomain: string;
  placement: 'apex' | 'subdomain';
  status: 'pending' | 'dns_ready' | 'active' | 'failed' | 'suspended';
  organizationActive: boolean;
  hasPublishedBrand: boolean;
};

function isLifecycleTarget(target: DomainHealthTarget): target is CanonicalLifecycleTarget {
  return Boolean(
    target.organizationId &&
      target.baseDomain &&
      target.placement &&
      target.status &&
      typeof target.organizationActive === 'boolean' &&
      typeof target.hasPublishedBrand === 'boolean',
  );
}

async function runLegacyCertificateHealth(
  targets: readonly DomainHealthTarget[],
  probeDeps: DomainCertificateProbeDeps,
): Promise<DomainHealthTickResult> {
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
    if (result.issues.length === 0) healthy += 1;
    else failures.push(describeDomainHealthResult(result));
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

function expectationFor(target: CanonicalLifecycleTarget): DomainLifecycleExpectation | null {
  if (target.placement === 'apex') {
    return env.CUSTOM_DOMAIN_EDGE_IP
      ? { placement: 'apex', edgeIp: env.CUSTOM_DOMAIN_EDGE_IP }
      : null;
  }
  return env.CUSTOM_DOMAIN_EDGE_IP && env.CUSTOM_DOMAIN_CNAME_TARGET
    ? {
        placement: 'subdomain',
        edgeIp: env.CUSTOM_DOMAIN_EDGE_IP,
        cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET,
      }
    : null;
}

function missingRuntimeTargetReason(target: CanonicalLifecycleTarget): string {
  if (target.placement === 'apex') return 'runtime_edge_ip_missing';
  const missing = [
    !env.CUSTOM_DOMAIN_EDGE_IP ? 'edge_ip' : null,
    !env.CUSTOM_DOMAIN_CNAME_TARGET ? 'cname_target' : null,
  ].filter((value): value is string => value !== null);
  return `runtime_${missing.join('_and_')}_missing`;
}

/**
 * The one custom-domain verifier used by both the scheduled tick and an owner recheck. For a
 * canonical binding it enforces DNS -> trusted managed TLS -> exact edge/nginx/webapp proof in
 * order, and it is the only application caller allowed to request an ACTIVE transition.
 */
export async function runDomainHealthTick(
  probeDeps: DomainCertificateProbeDeps = realDomainCertificateProbeDeps,
  options: Readonly<{ hostname?: string }> = {},
): Promise<DomainHealthTickResult> {
  const { buildAppDeps } = await import('@/app-layer/di/buildAppDeps');
  const appDeps = buildAppDeps();
  const allTargets = await appDeps.domainHealth.listConfiguredTargets();
  const hostname = options.hostname?.trim().toLowerCase();
  const targets = hostname
    ? allTargets.filter((target) => target.hostname === hostname)
    : allTargets;
  if (targets.length === 0) {
    return {
      checked: 0,
      healthy: 0,
      unhealthy: 0,
      canonicalResolutionFailed: false,
      failures: [],
    };
  }

  // Existing tests and a database not yet migrated still return hostname-only rows. Preserve the
  // old monitor there; lifecycle mutation begins only with a complete canonical binding target.
  if (!targets.every(isLifecycleTarget) || !appDeps.customDomainBinding) {
    return runLegacyCertificateHealth(targets, probeDeps);
  }

  const canonicalTargets: readonly CanonicalLifecycleTarget[] = targets;
  const failures: string[] = [];
  let healthy = 0;
  let runtimeConfigMissing = false;
  for (const target of canonicalTargets) {
    const lifecycleEligible =
      target.organizationActive &&
      target.hasPublishedBrand &&
      (await appDeps.customDomainBinding.isBindingLifecycleEligible(target.organizationId));
    if (!lifecycleEligible) {
      if (target.status !== 'suspended') {
        const transition = await appDeps.customDomainBinding.transitionBindingStatus({
          hostname: target.hostname,
          transition: 'mark_suspended',
          reason: 'organization_brand_or_custom_domain_entitlement_inactive',
        });
        if (!transition.ok) {
          failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
          continue;
        }
      }
      failures.push(`${target.hostname}: организация, опубликованный бренд или тариф недоступны`);
      continue;
    }

    const expectation = expectationFor(target);
    if (!expectation) {
      runtimeConfigMissing = true;
      const transition = await appDeps.customDomainBinding.transitionBindingStatus({
        hostname: target.hostname,
        transition: 'mark_failed',
        reason: missingRuntimeTargetReason(target),
      });
      if (!transition.ok) {
        failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
        continue;
      }
      failures.push(`${target.hostname}: не настроено ожидаемое DNS-значение сервера`);
      continue;
    }

    const result = await checkDomainCertificateHealth(target.hostname, [], probeDeps, expectation);
    if (!result.dnsReady) {
      const transition = await appDeps.customDomainBinding.transitionBindingStatus({
        hostname: target.hostname,
        transition: 'mark_failed',
        reason: result.issues[0]
          ? `${result.issues[0].code}:${result.issues[0].detail}`.slice(0, 500)
          : 'dns_verification_failed',
      });
      if (!transition.ok) {
        failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
        continue;
      }
      failures.push(describeDomainHealthResult(result));
      continue;
    }

    if (target.status !== 'active' && target.status !== 'dns_ready') {
      const transition = await appDeps.customDomainBinding.transitionBindingStatus({
        hostname: target.hostname,
        transition: 'mark_dns_ready',
      });
      if (!transition.ok) {
        failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
        continue;
      }
    }

    if (!result.tlsReady || !result.routingReady) {
      const blockingIssue = result.issues.find(
        (issue) =>
          issue.code === 'tls_handshake_failed' || issue.code === 'routing_probe_failed',
      );
      const transition = await appDeps.customDomainBinding.transitionBindingStatus({
        hostname: target.hostname,
        transition: 'mark_failed',
        reason: blockingIssue
          ? `${blockingIssue.code}:${blockingIssue.detail}`.slice(0, 500)
          : 'verification_failed',
      });
      if (!transition.ok) {
        failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
        continue;
      }
      failures.push(describeDomainHealthResult(result));
      continue;
    }

    if (target.status !== 'active') {
      const transition = await appDeps.customDomainBinding.transitionBindingStatus({
        hostname: target.hostname,
        transition: 'mark_active',
      });
      if (!transition.ok) {
        failures.push(`${target.hostname}: lifecycle transition refused (${transition.code})`);
        continue;
      }
    }
    if (result.issues.length === 0) healthy += 1;
    else failures.push(describeDomainHealthResult(result));
  }

  return {
    checked: canonicalTargets.length,
    healthy,
    unhealthy: canonicalTargets.length - healthy,
    canonicalResolutionFailed: runtimeConfigMissing,
    failures,
  };
}
