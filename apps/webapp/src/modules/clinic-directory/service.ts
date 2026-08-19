import type {
  ClaimOrganizationSlugInput,
  ClinicDirectoryPort,
  OrganizationSlugMutationResult,
  OrganizationSlugManagementState,
  OrganizationSlugResolution,
  RenameOrganizationSlugInput,
  ReserveOrganizationSlugInput,
  SetOrganizationSlugInput,
} from './ports';
import { suggestOrganizationSlug, validateOrganizationSlugCandidate } from './organizationSlug';

export type ClinicDirectoryService = {
  resolveOrganizationIdBySlug(slug: string): Promise<string | null>;
  getPublishedSlugForOrganization(organizationId: string): Promise<string | null>;
  getSlugManagementState(organizationId: string): Promise<OrganizationSlugManagementState>;
  resolveCanonicalSlug(slug: string): Promise<OrganizationSlugResolution | null>;
  checkSlugAvailability(slug: string): Promise<OrganizationSlugMutationResult>;
  reserveSlug(input: ReserveOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  claimReservedSlug(input: ClaimOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  renameSlug(input: RenameOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  setOrganizationSlug(input: SetOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
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

    async getSlugManagementState(organizationId) {
      return port.getSlugManagementState(organizationId);
    },

    async resolveCanonicalSlug(slugRaw) {
      const validated = validateOrganizationSlugCandidate(slugRaw);
      if (!validated.ok) return null;
      return port.resolveCanonicalSlug(validated.slug);
    },

    async checkSlugAvailability(slugRaw) {
      const validated = validatedSlug(slugRaw);
      if (!validated.ok) return validated;
      return (await port.isSlugAvailable(validated.slug))
        ? validated
        : { ok: false, code: 'slug_unavailable' };
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

    async setOrganizationSlug(input) {
      const validated = validatedSlug(input.slug);
      if (!validated.ok) return validated;

      const state = await port.getSlugManagementState(input.organizationId);
      if (state.currentSlug === validated.slug) {
        return { ok: false, code: 'slug_unchanged' };
      }
      if (state.currentSlug && !input.irreversibleRenameConfirmed) {
        return { ok: false, code: 'rename_confirmation_required' };
      }
      // Единственная пожизненная самостоятельная смена (владелец 19.08) ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ и не
      // должна. Любая проверка на этом уровне читает состояние отдельным запросом, до чужого
      // коммита, — две одновременные смены прошли бы обе. Решение принимает и записывает одна и та
      // же транзакция внутри `renameSlug`; сюда её отказ приходит своим кодом
      // `self_rename_allowance_spent` и уходит наверх нетронутым — «имя занято» здесь было бы
      // ложью о чужом владении.

      const reserved = await port.reserveSlug({
        organizationId: input.organizationId,
        slug: validated.slug,
      });
      if (!reserved.ok) return reserved;

      return state.currentSlug
        ? port.renameSlug({
            organizationId: input.organizationId,
            reservedSlug: reserved.slug,
            initiatedBy: input.initiatedBy,
          })
        : port.claimReservedSlug({
            organizationId: input.organizationId,
            slug: reserved.slug,
          });
    },

    suggestSlug: suggestOrganizationSlug,
  };
}
