/**
 * UX-05 slice B1 — organization brand publication port.
 * Authority: docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md.
 *
 * The port never takes an organization id from a client payload: every method receives an
 * already-trusted, server-derived organization id (membership context for mutations, the trusted
 * route object / enrollment for reads). Presentation is resolved LAST — after trusted object,
 * organization context, capability and entitlement (§3.2).
 */

export const ORG_BRAND_REVISION_STATUSES = ["draft", "published", "archived"] as const;
export type OrgBrandRevisionStatus = (typeof ORG_BRAND_REVISION_STATUSES)[number];

/** Canonical organization identification. NOT branding, never gated by the paid `branding` mechanic (§2, §5.1). */
export type CoreOrganizationContext = {
  organizationId: string;
  /** `be_organizations.title` — the canonical display name. Always present after a trusted lookup. */
  displayName: string;
  isActive: boolean;
};

export type OrgBrandRevision = {
  id: string;
  organizationId: string;
  status: OrgBrandRevisionStatus;
  /** Paid override of the displayed organization name; `null` = keep the core name. */
  displayName: string | null;
  logoMediaId: string | null;
  /**
   * Server-computed readiness of `logoMediaId`: the media row exists, is owned by THIS organization,
   * is `status = 'ready'` and is an image. Never derived from anything the client sends.
   */
  logoMediaReady: boolean;
  createdByPlatformUserId: string;
  publishedByPlatformUserId: string | null;
  archivedByPlatformUserId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveOrgBrandDraftInput = {
  organizationId: string;
  actorPlatformUserId: string;
  displayName: string | null;
  logoMediaId: string | null;
};

/** Raw fields behind the anonymous-safe public projection (see `getPublicProjection` below). */
export type PublicOrgBrandProjection = {
  organizationId: string;
  /** `be_organizations.title` — always present when the projection resolves at all. */
  coreDisplayName: string;
  /** Paid override from the PUBLISHED revision only; `null` when none is published. */
  brandDisplayName: string | null;
  logoMediaId: string | null;
  logoMediaReady: boolean;
};

export type OrgBrandingPort = {
  /** Core organization context; `null` only when the organization row is not readable/does not exist. */
  getCoreContext(organizationId: string): Promise<CoreOrganizationContext | null>;
  getPublishedRevision(organizationId: string): Promise<OrgBrandRevision | null>;
  getDraftRevision(organizationId: string): Promise<OrgBrandRevision | null>;
  /**
   * Anonymous public-page read (owner ruling 2026-07-26: branding must be as public as the clinic's
   * public page itself). Backed by the narrow SECURITY DEFINER accessor
   * `app.read_public_org_brand_projection` (migration 0243) — NOT by `getCoreContext` /
   * `getPublishedRevision`, whose RLS policies require a staff or enrolled-patient principal and
   * return nothing for an anonymous visitor. Returns `null` when the organization is inactive or
   * has not published a `clinic_public_directory_entries` row — the identical predicate
   * `/book/{slug}` itself requires. Draft and archived revisions are never visible through this path.
   */
  getPublicProjection(organizationId: string): Promise<PublicOrgBrandProjection | null>;
  /**
   * Creates or updates the single draft revision of this organization. Rejects a logo that is not
   * owned by the same organization with `org_brand_logo_media_must_be_owned_by_organization`
   * (the database trigger from migration 0238 is the authoritative chokepoint).
   */
  saveDraft(input: SaveOrgBrandDraftInput): Promise<OrgBrandRevision>;
  /**
   * Atomically archives the currently published revision (if any) and publishes the draft.
   * Returns `null` when there is no draft to publish.
   */
  publishDraft(input: {
    organizationId: string;
    actorPlatformUserId: string;
  }): Promise<OrgBrandRevision | null>;
  /** Archives the published revision. Returns `false` when nothing was published. */
  unpublish(input: { organizationId: string; actorPlatformUserId: string }): Promise<boolean>;
};
