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

  /** Internal foundation resolver. Public callers must still require a published projection. */
  resolveCanonicalSlug(slug: string): Promise<OrganizationSlugResolution | null>;

  reserveSlug(input: ReserveOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  claimReservedSlug(input: ClaimOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  renameSlug(input: RenameOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
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
  actorPlatformUserId: string;
};

export type ClaimOrganizationSlugInput = {
  slug: string;
  organizationId: string;
  actorPlatformUserId: string;
};

export type RenameOrganizationSlugInput = {
  organizationId: string;
  reservedSlug: string;
  actorPlatformUserId: string;
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
