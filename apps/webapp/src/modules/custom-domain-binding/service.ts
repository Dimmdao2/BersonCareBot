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
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';

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
  try {
    const platformHost = new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase();
    return hostname === platformHost || hostname.endsWith(`.${platformHost}`);
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
  /** Used only by the production tenant-surface lookup (`app-layer/surface`); never call directly from a route. */
  resolveActiveOrganizationByHostname(hostname: string): Promise<string | null>;
  readAnonymousPatientSurfaceProjection(
    organizationId: string,
  ): Promise<AnonymousPatientSurfaceProjection | null>;
};

export function createCustomDomainBindingService(
  port: CustomDomainBindingPort,
): CustomDomainBindingService {
  return {
    getBindingState: (organizationId) => port.getBindingState(organizationId),

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
        return port.setCustomDomainIntent({
          organizationId: input.organizationId,
          baseDomain,
          placement: 'subdomain',
          subdomainLabel: 'app',
        });
      }
      return port.setCustomDomainIntent({
        organizationId: input.organizationId,
        baseDomain,
        placement: 'apex',
        subdomainLabel: null,
      });
    },

    clearCustomDomainIntent: (input) => port.clearCustomDomainIntent(input),
    transitionBindingStatus: (input) => port.transitionBindingStatus(input),
    isHostnameAskAuthorized: (hostname) => port.isHostnameAskAuthorized(hostname),
    resolveActiveOrganizationByHostname: (hostname) =>
      port.resolveActiveOrganizationByHostname(hostname),
    readAnonymousPatientSurfaceProjection: (organizationId) =>
      port.readAnonymousPatientSurfaceProjection(organizationId),
  };
}

export type { CustomDomainBindingState };
