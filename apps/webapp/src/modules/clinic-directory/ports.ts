/**
 * Narrow public port for the canonical booking link `/book/{publicSlug}`
 * (owner canon: docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md §1).
 *
 * This is deliberately the only public surface of the `clinic_public_directory_entries`
 * projection needed today: slug -> organization id. It must run before any organization
 * principal exists (bootstrap context) and never expose org enumeration, `be_organizations`
 * internals, or a distinct "unpublished" vs "unknown" signal.
 */
export type ClinicDirectoryPort = {
  /**
   * Resolves a public slug to the organization id of a published, active clinic.
   * Returns `null` for unknown, unpublished, or inactive-organization slugs (fail-closed,
   * uniform — callers must not distinguish these cases in the response).
   */
  resolveOrganizationIdBySlug(slug: string): Promise<string | null>;

  /** Staff-only management read. Returns no value until the organization is explicitly published. */
  getPublishedSlugForOrganization(organizationId: string): Promise<string | null>;

  /**
   * Staff-only management read of the organization's durable `current` slug claim, regardless of
   * publish state. Unlike `getPublishedSlugForOrganization`, this reflects an address that has been
   * claimed (reserve -> claim) but not yet published to `clinic_public_directory_entries`.
   */
  getCurrentSlugForOrganization(organizationId: string): Promise<string | null>;

  /** Internal foundation resolver. Public callers must still require a published projection. */
  resolveCanonicalSlug(slug: string): Promise<OrganizationSlugResolution | null>;

  // Mutation repositories derive audit attribution from the trusted staff DB principal. The later
  // route/application layer must additionally enforce the organization-owner role; callers cannot
  // supply or override the audit actor through these inputs.
  reserveSlug(input: ReserveOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  claimReservedSlug(input: ClaimOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  renameSlug(input: RenameOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;

  /**
   * Creates or refreshes the `clinic_public_directory_entries` row that
   * `app.resolve_public_organization_slug` requires (`is_published = true`) for `/book/{slug}` to
   * resolve. Always writes the slug of the organization's current claim — never a caller-supplied
   * slug — so the directory row can never drift from `organization_slug_claims` (the DB trigger
   * `app.guard_clinic_directory_current_slug` also enforces this at commit time). Fails closed with
   * `current_slug_not_found` when the organization has not claimed an address yet (reserve+claim
   * must happen first).
   */
  publishOrganization(input: PublishOrganizationInput): Promise<PublishOrganizationResult>;

  /**
   * Explicit un-publish: the address/claim is untouched, only `is_published` flips back to
   * `false` (owner ruling 2026-07-26 — publication is a separate, reversible act from setting the
   * address; `/book/{slug}` and the public page must both 404 exactly like an unknown slug once
   * this runs). Fails closed with `not_published` when nothing was published.
   */
  unpublishOrganization(organizationId: string): Promise<{ ok: true } | { ok: false; code: 'not_published' }>;
};

export type OrganizationSlugResolution = {
  organizationId: string;
  requestedSlug: string;
  canonicalSlug: string;
  disposition: 'current' | 'redirect';
};

export type ReserveOrganizationSlugInput = {
  slug: string;
  organizationId: string;
};

export type ClaimOrganizationSlugInput = {
  slug: string;
  organizationId: string;
};

export type RenameOrganizationSlugInput = {
  organizationId: string;
  reservedSlug: string;
};

export type OrganizationSlugMutationResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      code:
        | 'slug_unavailable'
        | 'reservation_not_found'
        | 'reservation_owner_mismatch'
        | 'current_slug_not_found'
        | 'current_slug_already_exists'
        | 'invalid_slug'
        | 'reserved_slug';
    };

export type PublishOrganizationInput = {
  organizationId: string;
  /** Explicit copy of `be_organizations.title` at publish time; owner-editable afterwards. */
  displayName: string;
};

export type PublishOrganizationResult =
  | { ok: true; slug: string }
  | { ok: false; code: 'current_slug_not_found' };
