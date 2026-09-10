import type {
  AnonymousPatientSurfaceProjection,
  ClearCustomDomainIntentInput,
  CustomDomainBindingPort,
  CustomDomainBindingState,
  CustomDomainIntentResult,
  CustomDomainTransition,
  CustomDomainTransitionErrorCode,
  SetCustomDomainIntentInput,
} from './ports';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { DomainHealthTarget } from '@/modules/domain-health/ports';

const HOSTNAME_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOSTNAME_LENGTH = 253;

function normalizeDomainLabelInput(value: string): string {
  return value.trim().toLowerCase();
}

/** A base domain is a plain multi-label hostname the clinic owns — never a URL, never our own host. */
function isPlausibleBaseDomain(value: string): boolean {
  if (value.length === 0 || value.length > MAX_HOSTNAME_LENGTH) return false;
  if (value.includes('://') || value.includes('/') || value.includes(':')) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => HOSTNAME_LABEL_RE.test(label));
}

function isPlatformOwnedHostname(hostname: string): boolean {
  const platformHosts = new Set(['therapygo.ru']);
  try {
    platformHosts.add(new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase());
    platformHosts.add(new URL(STAFF_SURFACE.origin).hostname.toLowerCase());
    return [...platformHosts].some(
      (platformHost) => hostname === platformHost || hostname.endsWith(`.${platformHost}`),
    );
  } catch {
    // An invalid deploy origin must never make a custom-domain claim more permissive.
    return true;
  }
}

export type CustomDomainBindingService = {
  getBindingState: CustomDomainBindingPort['getBindingState'];
  setCustomDomainIntent(
    input: SetCustomDomainIntentInput,
  ): Promise<CustomDomainIntentResult>;
  clearCustomDomainIntent(input: ClearCustomDomainIntentInput): Promise<CustomDomainIntentResult>;
  transitionBindingStatus(input: {
    hostname: string;
    transition: CustomDomainTransition;
    reason?: string;
  }): Promise<{ ok: true } | { ok: false; code: CustomDomainTransitionErrorCode }>;
  isHostnameAskAuthorized(hostname: string): Promise<boolean>;
  isBindingLifecycleEligible(organizationId: string): Promise<boolean>;
  /** Used only by the production tenant-surface lookup (`app-layer/surface`); never call directly from a route. */
  resolveActiveOrganizationByHostname(hostname: string): Promise<string | null>;
  readAnonymousPatientSurfaceProjection(
    organizationId: string,
  ): Promise<AnonymousPatientSurfaceProjection | null>;
  /**
   * The one organization-bound patient-link seam. A ready custom hostname wins; every other
   * lifecycle state deliberately falls back to the permanent platform alias.
   */
  resolvePatientPublicOrigin(organizationId: string): Promise<string>;
};

export function patientPublicOriginFromProjection(
  projection: AnonymousPatientSurfaceProjection,
): string {
  if (projection.activeCustomDomainHostname) {
    return `https://${projection.activeCustomDomainHostname}`;
  }

  const patientOrigin = new URL(PATIENT_DEFAULT_SURFACE.origin);
  const staffOrigin = new URL(STAFF_SURFACE.origin);
  // DEV/TEST deliberately serve both surfaces from one host until cutover. In that configuration
  // a synthetic slug host cannot resolve, so retain the exact typed patient surface (including port).
  if (patientOrigin.hostname === staffOrigin.hostname) {
    return patientOrigin.origin;
  }
  patientOrigin.hostname = `${projection.clinicSlug}.${patientOrigin.hostname}`;
  return patientOrigin.origin;
}

function hasSharedPatientAndStaffHost(): boolean {
  return (
    new URL(PATIENT_DEFAULT_SURFACE.origin).hostname === new URL(STAFF_SURFACE.origin).hostname
  );
}

export function createCustomDomainBindingService(
  port: CustomDomainBindingPort,
  deps?: Readonly<{
    resolveCustomDomainEntitlement(organizationId: string): Promise<boolean>;
    findVerificationTarget(hostname: string): Promise<DomainHealthTarget | null>;
    edgeIp?: string;
    cnameTarget?: string;
  }>,
): CustomDomainBindingService {
  const withDnsInstruction = (
    state: CustomDomainBindingState | null,
  ): CustomDomainBindingState | null => {
    if (!state) return null;
    if (state.placement === 'apex') {
      return {
        ...state,
        dnsInstructions: deps?.edgeIp
          ? [{ recordType: 'A', name: '@', value: deps.edgeIp }]
          : null,
      };
    }
    const dnsInstructions = [
      ...(deps?.edgeIp ? [{ recordType: 'A' as const, name: 'app' as const, value: deps.edgeIp }] : []),
      ...(deps?.cnameTarget
        ? [{ recordType: 'CNAME' as const, name: 'app' as const, value: deps.cnameTarget }]
        : []),
    ];
    return { ...state, dnsInstructions: dnsInstructions.length > 0 ? dnsInstructions : null };
  };
  const isBindingLifecycleEligible = (organizationId: string): Promise<boolean> =>
    deps?.resolveCustomDomainEntitlement(organizationId) ?? Promise.resolve(true);

  return {
    async getBindingState(organizationId) {
      return withDnsInstruction(await port.getBindingState(organizationId));
    },

    async setCustomDomainIntent(input): Promise<CustomDomainIntentResult> {
      const baseDomain = normalizeDomainLabelInput(input.baseDomain);
      if (!isPlausibleBaseDomain(baseDomain)) {
        return { ok: false, code: 'invalid_base_domain' };
      }
      const hostname = input.placement === 'subdomain' ? `app.${baseDomain}` : baseDomain;
      if (isPlatformOwnedHostname(hostname)) {
        return { ok: false, code: 'invalid_base_domain' };
      }
      if (input.placement === 'subdomain') {
        const result = await port.setCustomDomainIntent({
          organizationId: input.organizationId,
          baseDomain,
          placement: 'subdomain',
          subdomainLabel: 'app',
        });
        return result.ok ? { ...result, state: withDnsInstruction(result.state) } : result;
      }
      const result = await port.setCustomDomainIntent({
        organizationId: input.organizationId,
        baseDomain,
        placement: 'apex',
        subdomainLabel: null,
      });
      return result.ok ? { ...result, state: withDnsInstruction(result.state) } : result;
    },

    async clearCustomDomainIntent(input) {
      const result = await port.clearCustomDomainIntent(input);
      return result.ok ? { ...result, state: withDnsInstruction(result.state) } : result;
    },
    transitionBindingStatus: (input) => port.transitionBindingStatus(input),
    async isHostnameAskAuthorized(hostname) {
      if (!(await port.isHostnameAskAuthorized(hostname))) return false;
      if (!deps) return true;
      const target = await deps?.findVerificationTarget(hostname);
      return Boolean(
        target?.organizationId &&
          target.organizationActive &&
          target.hasPublishedBrand &&
          (await isBindingLifecycleEligible(target.organizationId)),
      );
    },
    isBindingLifecycleEligible,
    async resolveActiveOrganizationByHostname(hostname) {
      const organizationId = await port.resolveActiveOrganizationByHostname(hostname);
      return organizationId && (await isBindingLifecycleEligible(organizationId))
        ? organizationId
        : null;
    },
    async readAnonymousPatientSurfaceProjection(organizationId) {
      const projection = await port.readAnonymousPatientSurfaceProjection(organizationId);
      if (!projection?.activeCustomDomainHostname) return projection;
      if (await isBindingLifecycleEligible(organizationId)) return projection;
      const { activeCustomDomainHostname: _inactiveCustomDomain, ...slugProjection } = projection;
      return slugProjection;
    },
    async resolvePatientPublicOrigin(organizationId) {
      const projection = await port.readAnonymousPatientSurfaceProjection(organizationId);
      if (!projection) {
        // The current named DEV/TEST tenant has no public-directory projection. Its signed reminder
        // wake remains a patient delivery path, so the deliberate one-host configuration is the only
        // case where the typed patient surface is a valid fallback without a clinic slug.
        if (hasSharedPatientAndStaffHost()) return PATIENT_DEFAULT_SURFACE.origin;
        throw new Error('patient_public_origin_unresolved');
      }
      if (projection.activeCustomDomainHostname && !(await isBindingLifecycleEligible(organizationId))) {
        const { activeCustomDomainHostname: _inactiveCustomDomain, ...slugProjection } = projection;
        return patientPublicOriginFromProjection(slugProjection);
      }
      return patientPublicOriginFromProjection(projection);
    },
  };
}

export type { CustomDomainBindingState };
