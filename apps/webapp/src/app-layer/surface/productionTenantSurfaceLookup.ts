/**
 * The ONE production `TenantSurfaceLookup` (TPB-16, B1/B2/B3/B4a/B8 reopening #787).
 *
 * `proxy.ts` used to accept a `TenantSurfaceLookup` as its second argument for tests AND treat a
 * missing/non-function value as "no tenant surface" in production — the exact test-only dependency
 * seam the reopening ruling forbids. This module is the real, always-wired lookup: it resolves
 * either a `<slug>.therapygo.ru` patient subdomain (reusing the existing pre-session-safe
 * `ClinicDirectoryService`) or an externally-owned ACTIVE custom domain
 * (`CustomDomainBindingService`), then projects the anonymous-safe brand/redirect data through the
 * SAME narrow accessor for both paths.
 *
 * Composition-root discipline: this is the one non-route caller of `buildAppDeps()` outside
 * `page.tsx`/`route.ts`/server actions — `proxy.ts` is itself top-level app-layer request handling
 * (Next's own choke point), so this module lives under `app-layer`, not `modules`.
 */
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolvePatientSubdomainOrganization } from '@/modules/clinic-directory/patientSubdomainOrganization';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import type {
  TenantSurfaceLookup,
  TenantSurfaceLookupResult,
} from '@/shared/lib/surface/requestSurface';

/**
 * `<label>.<patientBaseHost>` -> `label`, only when there is exactly one extra label and it is
 * non-empty. A custom domain is by definition NOT a suffix of our own patient host, so this also
 * doubles as "is this even a candidate for the slug path at all".
 */
function extractPatientSubdomainLabel(normalizedHost: string): string | null {
  let patientBaseHost: string;
  try {
    patientBaseHost = new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  const suffix = `.${patientBaseHost}`;
  if (!normalizedHost.endsWith(suffix)) return null;
  const label = normalizedHost.slice(0, -suffix.length);
  return label.length > 0 && !label.includes('.') ? label : null;
}

async function resolveOrganizationForHost(
  normalizedHost: string,
  deps: ReturnType<typeof buildAppDeps>,
): Promise<string | null> {
  if (deps.customDomainBinding) {
    const byCustomDomain =
      await deps.customDomainBinding.resolveActiveOrganizationByHostname(normalizedHost);
    if (byCustomDomain) return byCustomDomain;
  }
  const subdomainLabel = extractPatientSubdomainLabel(normalizedHost);
  if (!subdomainLabel || !deps.clinicDirectory) return null;
  const resolved = await resolvePatientSubdomainOrganization(deps.clinicDirectory, subdomainLabel);
  return resolved.kind === 'resolved' ? resolved.organizationId : null;
}

export const productionTenantSurfaceLookup: TenantSurfaceLookup = async (
  normalizedHost,
  purpose = 'surface',
): Promise<TenantSurfaceLookupResult> => {
  stampBootstrapPrincipal('proxy:resolve-tenant-surface');
  const deps = buildAppDeps();
  if (!deps.customDomainBinding && !deps.clinicDirectory) return { status: 'unknown' };

  if (purpose === 'preactivation_probe') {
    const authorized =
      deps.customDomainBinding &&
      (await runWithDbInfraPrincipal(
        { source: 'proxy:custom-domain-probe' },
        () => deps.customDomainBinding!.isHostnameAskAuthorized(normalizedHost),
      ));
    return authorized
      ? { status: 'probe' }
      : { status: 'unknown' };
  }

  const organizationId = await resolveOrganizationForHost(normalizedHost, deps);
  if (!organizationId || !deps.customDomainBinding) return { status: 'unknown' };

  const projection =
    await deps.customDomainBinding.readAnonymousPatientSurfaceProjection(organizationId);
  if (!projection) return { status: 'unknown' };

  return {
    status: 'active',
    organizationId,
    clinicSlug: projection.clinicSlug,
    skipPublicCardAtRoot: projection.skipPublicCardAtRoot,
    effectivePatientBrandOrganizationId: organizationId,
    effectivePatientBrand: {
      effectiveDisplayName: projection.effectiveDisplayName,
      patientAppName: projection.patientAppName,
      accentToken: projection.accentToken,
      ...(projection.logoUrl ? { logoUrl: projection.logoUrl } : {}),
    },
    ...(projection.activeCustomDomainHostname
      ? { activeCustomDomainHostname: projection.activeCustomDomainHostname }
      : {}),
    ...(projection.clinicMessengerBots
      ? { clinicMessengerBots: projection.clinicMessengerBots }
      : {}),
  };
};
