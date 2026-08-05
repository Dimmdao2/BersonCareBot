/**
 * UX-05 slice B1 — organization brand publication service (backend foundation, no UI).
 * Authority: docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md.
 *
 * Invariants this module is responsible for:
 *   §3.1 branding never authorizes anything — nothing here reads or returns an authorization
 *        decision, and no returned field is ever used as an identifier for a later lookup.
 *   §3.2 resolution order: trusted object/relationship -> organization context -> capability ->
 *        entitlement -> readiness -> presentation. Presentation is composed LAST, here.
 *   §3.6 the client never sends the effective logo URL, sender, organization id or redirect origin.
 *        Mutation inputs carry NO organization id (it comes from the trusted membership context)
 *        and NO url; the effective logo URL is computed from the published revision.
 *   §3.3/§5.1 absence of branding degrades to platform visuals + core organization context, never
 *        to an anonymous surface. The core display name is returned unconditionally.
 *   §3.4 core organization context is NOT branding and is NOT gated by the paid `branding` mechanic.
 *   §3.8 a brand/tariff change never deletes identity, enrollment, clinical history or audit trail:
 *        unpublish archives, it does not delete.
 */
import type { CoreOrganizationContext, OrgBrandRevision, OrgBrandingPort } from './ports';
import type { MechanicAccessResolution, MechanicAccessState } from '../org-entitlements/types';

/** Trusted staff context. Only `requireOrganizationManagementContext()` may produce this. */
export type OrgBrandingManagementContext = Readonly<{
  /** Server-side membership organization. NEVER a request payload / query / host value. */
  organizationId: string;
  actorPlatformUserId: string;
  /** Proof that the `organization.management` capability was checked before the call. */
  hasOrganizationManagementCapability: true;
}>;

/** Why the paid additions are (not) applied. Diagnostics for management UI; never an authorization input. */
export type OrgBrandingResolution = 'applied' | 'entitlement_disabled' | 'no_published_revision';

export type EffectiveOrgBranding = {
  organizationId: string;
  /** Always present (§3.3): the canonical organization identification, not branding. */
  core: { displayName: string; isActive: boolean };
  /** Paid additions. Every field is independently `null` when its readiness fails (§5.1). */
  paid: { displayName: string | null; logoUrl: string | null };
  /** The name a surface should render: paid override when applied, else the core name. */
  effectiveDisplayName: string;
  resolution: OrgBrandingResolution;
};

export type OrgBrandingManagementState = {
  effective: EffectiveOrgBranding;
  /** The section is visible for full access, grace and read-only lifecycle states. */
  brandingVisible: boolean;
  /** Only full access and grace may mutate the retained brand revision. */
  brandingMutationAvailable: boolean;
  accessState: MechanicAccessState;
  draft: OrgBrandRevision | null;
  published: OrgBrandRevision | null;
};

export type OrgBrandDraftInput = {
  displayName: string | null;
  logoMediaId: string | null;
};

export type OrgBrandMutationFailure =
  | { ok: false; code: 'entitlement_disabled' }
  | { ok: false; code: 'commercial_read_only' }
  | { ok: false; code: 'nothing_to_publish' }
  | { ok: false; code: 'nothing_published' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_NAME_LENGTH = 120;

/**
 * Keys a caller must never be able to smuggle into a branding mutation. `organizationId` and
 * `organization_id` would attempt to retarget the tenant (§3.6, §5.3); `logoUrl` / `logo_url` /
 * `logoMediaUrl` would attempt to dictate the effective asset URL instead of referencing a media
 * row the server can validate. This is a structural guard: the typed input has no such fields, so
 * only an untyped/adversarial caller can reach it — and it fails loudly instead of being ignored.
 */
const REJECTED_MUTATION_KEYS = [
  'organizationId',
  'organization_id',
  'organisationId',
  'actorPlatformUserId',
  'logoUrl',
  'logo_url',
  'logoMediaUrl',
  'logoPath',
] as const;

export const CALLER_SUPPLIED_ORGANIZATION_ID_ERROR = 'caller_supplied_branding_field_rejected';
export const CORE_CONTEXT_UNAVAILABLE_ERROR = 'org_branding_core_context_unavailable';

/** The one place an effective logo URL is produced, from a media id the server validated. */
export function orgBrandLogoUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}

function assertNoCallerSuppliedFields(input: unknown): void {
  if (input === null || typeof input !== 'object') return;
  for (const key of REJECTED_MUTATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`${CALLER_SUPPLIED_ORGANIZATION_ID_ERROR}:${key}`);
    }
  }
}

function normalizeDisplayNameOverride(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
  return trimmed;
}

function normalizeLogoMediaId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!UUID_RE.test(trimmed)) throw new Error('org_brand_logo_media_id_invalid');
  return trimmed.toLowerCase();
}

function platformOnly(
  core: CoreOrganizationContext,
  resolution: OrgBrandingResolution,
): EffectiveOrgBranding {
  return {
    organizationId: core.organizationId,
    core: { displayName: core.displayName, isActive: core.isActive },
    paid: { displayName: null, logoUrl: null },
    effectiveDisplayName: core.displayName,
    resolution,
  };
}

function brandingVisible(state: MechanicAccessState): boolean {
  return state === 'full_access' || state === 'grace' || state === 'read_only';
}

function brandingMutationAvailable(state: MechanicAccessState): boolean {
  return state === 'full_access' || state === 'grace';
}

function brandingMutationFailure(state: MechanicAccessState): OrgBrandMutationFailure | null {
  if (state === 'read_only') return { ok: false, code: 'commercial_read_only' };
  if (!brandingVisible(state)) return { ok: false, code: 'entitlement_disabled' };
  return null;
}

export function createOrgBrandingService(deps: {
  port: OrgBrandingPort;
  /**
   * 3.2: physically refuses branding writes unless a passing `branding` mutation decision
   * already ran in this request (injected from `buildAppDeps.ts`).
   */
  assertWriteClearance?: (mechanic: 'branding') => void;
  /**
   * Existing entitlement resolver, wired at the composition root. Only paid additions depend on
   * it — core context never does (§3.4). The complete access state, rather than a boolean, keeps
   * presentation visible in `read_only` while refusing mutations through the same tariff ladder.
   */
  resolveBrandingAccess: (organizationId: string) => Promise<MechanicAccessResolution>;
}) {
  async function requireCoreContext(organizationId: string): Promise<CoreOrganizationContext> {
    const core = await deps.port.getCoreContext(organizationId);
    if (!core) {
      // Fail loudly rather than render an anonymous surface (§3.3). A missing/unreadable core row
      // means the trusted lookup itself is broken (or ran without a DB principal under FORCE RLS).
      throw new Error(CORE_CONTEXT_UNAVAILABLE_ERROR);
    }
    return core;
  }

  /**
   * The single resolver every surface uses. `organizationId` must already be trusted (§3.4): a
   * session membership, an enrollment, an invite or a booking object — never a host, slug or body.
   */
  function resolveEffectiveWithAccess(
    core: CoreOrganizationContext,
    access: MechanicAccessResolution,
    published: OrgBrandRevision | null,
  ): EffectiveOrgBranding {
    if (!brandingVisible(access.state)) {
      // Retained published data is NOT deleted; it is merely not applied (§10).
      return platformOnly(core, 'entitlement_disabled');
    }

    if (!published) return platformOnly(core, 'no_published_revision');

    const paidDisplayName = normalizeDisplayNameOverride(published.displayName);
    // Readiness per asset: an unowned / unready / non-image logo collapses to null and the rest of
    // the paid layer still applies. `logoMediaReady` is computed by the port from the media row.
    const logoUrl =
      published.logoMediaReady && published.logoMediaId
        ? orgBrandLogoUrl(published.logoMediaId)
        : null;

    return {
      organizationId: core.organizationId,
      core: { displayName: core.displayName, isActive: core.isActive },
      paid: { displayName: paidDisplayName, logoUrl },
      effectiveDisplayName: paidDisplayName ?? core.displayName,
      resolution: 'applied',
    };
  }

  async function resolveEffectiveOrgBranding(
    organizationId: string,
  ): Promise<EffectiveOrgBranding> {
    const [core, access, published] = await Promise.all([
      requireCoreContext(organizationId),
      deps.resolveBrandingAccess(organizationId),
      deps.port.getPublishedRevision(organizationId),
    ]);
    return resolveEffectiveWithAccess(core, access, published);
  }

  return {
    resolveEffectiveOrgBranding,

    /** Management read. Available even with the mechanic off, so the UI can show an upgrade state (§10). */
    async getManagementState(
      ctx: OrgBrandingManagementContext,
    ): Promise<OrgBrandingManagementState> {
      const [core, access, draft, published] = await Promise.all([
        requireCoreContext(ctx.organizationId),
        deps.resolveBrandingAccess(ctx.organizationId),
        deps.port.getDraftRevision(ctx.organizationId),
        deps.port.getPublishedRevision(ctx.organizationId),
      ]);
      return {
        effective: resolveEffectiveWithAccess(core, access, published),
        brandingVisible: brandingVisible(access.state),
        brandingMutationAvailable: brandingMutationAvailable(access.state),
        accessState: access.state,
        draft,
        published,
      };
    },

    async saveDraft(
      ctx: OrgBrandingManagementContext,
      input: OrgBrandDraftInput,
    ): Promise<{ ok: true; draft: OrgBrandRevision } | OrgBrandMutationFailure> {
      assertNoCallerSuppliedFields(input);
      const failure = brandingMutationFailure(
        (await deps.resolveBrandingAccess(ctx.organizationId)).state,
      );
      if (failure) return failure;
      deps.assertWriteClearance?.('branding');
      const draft = await deps.port.saveDraft({
        // The trusted context is the ONLY source of the organization id.
        organizationId: ctx.organizationId,
        actorPlatformUserId: ctx.actorPlatformUserId,
        displayName: normalizeDisplayNameOverride(input.displayName),
        logoMediaId: normalizeLogoMediaId(input.logoMediaId),
      });
      return { ok: true, draft };
    },

    async publishDraft(
      ctx: OrgBrandingManagementContext,
    ): Promise<{ ok: true; published: OrgBrandRevision } | OrgBrandMutationFailure> {
      const failure = brandingMutationFailure(
        (await deps.resolveBrandingAccess(ctx.organizationId)).state,
      );
      if (failure) return failure;
      deps.assertWriteClearance?.('branding');
      const published = await deps.port.publishDraft({
        organizationId: ctx.organizationId,
        actorPlatformUserId: ctx.actorPlatformUserId,
      });
      if (!published) return { ok: false, code: 'nothing_to_publish' };
      return { ok: true, published };
    },

    /** Archives the live revision. History is retained (§3.8); nothing is deleted. */
    async unpublish(
      ctx: OrgBrandingManagementContext,
    ): Promise<{ ok: true } | OrgBrandMutationFailure> {
      const failure = brandingMutationFailure(
        (await deps.resolveBrandingAccess(ctx.organizationId)).state,
      );
      if (failure) return failure;
      deps.assertWriteClearance?.('branding');
      const unpublished = await deps.port.unpublish({
        organizationId: ctx.organizationId,
        actorPlatformUserId: ctx.actorPlatformUserId,
      });
      if (!unpublished) return { ok: false, code: 'nothing_published' };
      return { ok: true };
    },
  };
}

export type OrgBrandingService = ReturnType<typeof createOrgBrandingService>;
