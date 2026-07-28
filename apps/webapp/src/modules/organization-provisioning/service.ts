import type {
  OrganizationProvisioningPort,
  SpecialistOwnerProvisioningResult,
  SpecialistSignupIntentInput,
} from './ports';
import {
  ensureOwnBookableSpecialist as ensureOwnBookableSpecialistCore,
  type EnsureOwnBookableSpecialistContext,
} from './ensureOwnBookableSpecialist';
import { validateOrganizationSlugCandidate } from '@/modules/clinic-directory/organizationSlug';

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function createOrganizationProvisioningService(deps: {
  provisioningPort: OrganizationProvisioningPort;
}) {
  return {
    async createSpecialistSignupIntent(input: SpecialistSignupIntentInput): Promise<void> {
      const organizationTitle = normalizeTitle(input.organizationTitle);
      const specialistFullName = normalizeTitle(input.specialistFullName);
      const organizationSlug = validateOrganizationSlugCandidate(input.organizationSlug);
      if (!organizationTitle) {
        throw new Error('organization_title_required');
      }
      if (!specialistFullName) {
        throw new Error('specialist_full_name_required');
      }
      if (!organizationSlug.ok) {
        throw new Error(organizationSlug.code);
      }
      await deps.provisioningPort.createSpecialistSignupIntent({
        ...input,
        organizationTitle,
        organizationSlug: organizationSlug.slug,
        specialistFullName,
      });
    },

    async getSpecialistSignupIntentByChallengeId(challengeId: string) {
      return deps.provisioningPort.getSpecialistSignupIntentByChallengeId(challengeId);
    },

    async getLatestSpecialistSignupIntentForUser() {
      return deps.provisioningPort.getLatestSpecialistSignupIntentForUser();
    },

    async replacePendingSpecialistSignupChallenge(input: {
      challengeId: string;
      organizationSlug: string;
    }) {
      const organizationSlug = validateOrganizationSlugCandidate(input.organizationSlug);
      if (!organizationSlug.ok) {
        throw new Error(organizationSlug.code);
      }
      return deps.provisioningPort.replacePendingSpecialistSignupChallenge({
        challengeId: input.challengeId,
        organizationSlug: organizationSlug.slug,
      });
    },

    async provisionSpecialistOwner(input: {
      challengeId: string;
    }): Promise<SpecialistOwnerProvisioningResult> {
      return deps.provisioningPort.provisionSpecialistOwner(input);
    },

    async ensureOwnBookableSpecialist(
      ctx: EnsureOwnBookableSpecialistContext,
    ): Promise<string | null> {
      return ensureOwnBookableSpecialistCore(deps.provisioningPort, ctx);
    },
  };
}

export type OrganizationProvisioningService = ReturnType<
  typeof createOrganizationProvisioningService
>;
