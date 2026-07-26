import type {
  ClaimOrganizationSlugInput,
  ClinicDirectoryPort,
  OrganizationSlugMutationResult,
  OrganizationSlugResolution,
  RenameOrganizationSlugInput,
  ReserveOrganizationSlugInput,
} from './ports';
import { suggestOrganizationSlug, validateOrganizationSlugCandidate } from './organizationSlug';

export type ClinicDirectoryService = {
  resolveOrganizationIdBySlug(slug: string): Promise<string | null>;
  getPublishedSlugForOrganization(organizationId: string): Promise<string | null>;
  resolveCanonicalSlug(slug: string): Promise<OrganizationSlugResolution | null>;
  reserveSlug(input: ReserveOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  claimReservedSlug(input: ClaimOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  renameSlug(input: RenameOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  suggestSlug(title: string): string | null;
};

/** Public slug charset: lower-case ascii letters, digits and hyphens, matching the DB check constraint. */
const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export function createClinicDirectoryService(port: ClinicDirectoryPort): ClinicDirectoryService {
  function validatedSlug(raw: string): OrganizationSlugMutationResult | { ok: true; slug: string } {
    return validateOrganizationSlugCandidate(raw);
  }

  return {
    async resolveOrganizationIdBySlug(slugRaw: string) {
      const slug = slugRaw.trim().toLowerCase();
      // Reject obviously-invalid input before it reaches the DB chokepoint; still fail-closed
      // (null), never throws, so callers cannot distinguish malformed input from unknown slug.
      if (!SLUG_PATTERN.test(slug)) return null;
      return port.resolveOrganizationIdBySlug(slug);
    },

    async getPublishedSlugForOrganization(organizationId) {
      return port.getPublishedSlugForOrganization(organizationId);
    },

    async resolveCanonicalSlug(slugRaw) {
      const validated = validateOrganizationSlugCandidate(slugRaw);
      if (!validated.ok) return null;
      return port.resolveCanonicalSlug(validated.slug);
    },

    async reserveSlug(input) {
      const validated = validatedSlug(input.slug);
      if (!validated.ok) return validated;
      return port.reserveSlug({ ...input, slug: validated.slug });
    },

    async claimReservedSlug(input) {
      const validated = validatedSlug(input.slug);
      if (!validated.ok) return validated;
      return port.claimReservedSlug({ ...input, slug: validated.slug });
    },

    async renameSlug(input) {
      const validated = validatedSlug(input.reservedSlug);
      if (!validated.ok) return validated;
      return port.renameSlug({ ...input, reservedSlug: validated.slug });
    },

    suggestSlug: suggestOrganizationSlug,
  };
}
