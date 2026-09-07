import type { OrgCustomDomainPlacement, OrgCustomDomainStatus } from '../../../db/schema';
import type { ClinicMessengerBots } from '@/shared/lib/surface/requestSurface';

export type { OrgCustomDomainPlacement, OrgCustomDomainStatus };

/**
 * B2/B8/C5a — server-owned custom-domain binding lifecycle
 * (`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`).
 *
 * This module owns hostname computation, validation and the lifecycle state machine. It never
 * probes DNS or claims a certificate exists — that boundary belongs to a later verifier/edge
 * integration (see `transitionBindingStatus`'s doc comment).
 */
export type CustomDomainBindingState = Readonly<{
  organizationId: string;
  baseDomain: string;
  placement: OrgCustomDomainPlacement;
  subdomainLabel: string | null;
  hostname: string;
  status: OrgCustomDomainStatus;
  statusReason: string | null;
  activatedAt: string | null;
  dnsInstruction?: Readonly<{
    recordType: 'A' | 'CNAME';
    name: '@' | 'app';
    value: string;
  }> | null;
}>;

/**
 * `organizationId` is checked against the trusted staff DB principal by the repository, not
 * trusted from this input alone. There is deliberately no `actorPlatformUserId` field here: audit
 * attribution is derived from the current DB principal, same discipline as
 * `pgClinicDirectory.ts#reserveSlug` — a caller cannot supply or override the audit actor.
 */
export type SetCustomDomainIntentInput = Readonly<{
  organizationId: string;
  baseDomain: string;
  placement: OrgCustomDomainPlacement;
  /** Compatibility-only input. The service always replaces it with the server-owned `app`. */
  subdomainLabel?: string | null;
}>;

export type ClearCustomDomainIntentInput = Readonly<{
  organizationId: string;
}>;

export type CustomDomainIntentErrorCode =
  | 'invalid_base_domain'
  | 'invalid_subdomain_label'
  | 'hostname_taken'
  | 'nothing_to_clear';

export type CustomDomainIntentResult =
  | Readonly<{ ok: true; state: CustomDomainBindingState | null }>
  | Readonly<{ ok: false; code: CustomDomainIntentErrorCode }>;

/** The anonymous-visible projection `app.read_anonymous_patient_surface_projection` returns. */
export type AnonymousPatientSurfaceProjection = Readonly<{
  clinicSlug: string;
  skipPublicCardAtRoot: boolean;
  effectiveDisplayName: string;
  patientAppName: string;
  accentToken: string;
  logoUrl?: string;
  /** Present only when this organization currently has an ACTIVE custom-domain binding. */
  activeCustomDomainHostname?: string;
  /** Existing anonymous-safe clinic bot identities; credentials never enter this projection. */
  clinicMessengerBots?: ClinicMessengerBots;
}>;

export type CustomDomainTransition = 'mark_dns_ready' | 'mark_active' | 'mark_failed' | 'mark_suspended';

export type CustomDomainTransitionErrorCode = 'not_found' | 'invalid_transition';

export type CustomDomainBindingPort = {
  /** Pre-session-safe: hostname -> organization id, only for an ACTIVE binding of an active org. */
  resolveActiveOrganizationByHostname(hostname: string): Promise<string | null>;

  /** Pre-session-safe: the anonymous-visible surface projection for an already-resolved org. */
  readAnonymousPatientSurfaceProjection(
    organizationId: string,
  ): Promise<AnonymousPatientSurfaceProjection | null>;

  /** Staff-only management read for the settings surface. */
  getBindingState(organizationId: string): Promise<CustomDomainBindingState | null>;

  /**
   * Staff write path: set the clinic's custom-domain intent. The final `hostname` is ALWAYS
   * computed server-side from `baseDomain` + `placement` (+ `subdomainLabel`) — never accepted
   * precomputed. Superseding an existing binding quarantines it first (B8): the old hostname stays
   * permanently claimed (anti-squatting, same discipline as `organization_slug_claims`), never
   * reused by anyone, including this same organization.
   */
  setCustomDomainIntent(input: SetCustomDomainIntentInput): Promise<CustomDomainIntentResult>;

  /** Staff write path: quarantine the organization's current live (non-quarantined) binding, if any. */
  clearCustomDomainIntent(input: ClearCustomDomainIntentInput): Promise<CustomDomainIntentResult>;

  /**
   * Internal door for a LATER verifier/edge integration (not built in this slice). It never runs on
   * its own and this module never calls it from DNS/network signals gathered in a request path.
   * Allowed transitions: pending->dns_ready, dns_ready->active, suspended->active,
   * (pending|dns_ready)->failed, active->suspended.
   */
  transitionBindingStatus(input: {
    hostname: string;
    transition: CustomDomainTransition;
    reason?: string;
  }): Promise<{ ok: true } | { ok: false; code: CustomDomainTransitionErrorCode }>;

  /**
   * Caddy `on_demand_tls` `ask` authorization: is this hostname one we are willing to request a
   * certificate for right now. Never probes DNS, never claims a certificate exists.
   */
  isHostnameAskAuthorized(hostname: string): Promise<boolean>;
};
