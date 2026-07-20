import type {
  OrganizationProvisioningPort,
  SpecialistOwnerProvisioningResult,
  SpecialistSignupIntentInput,
} from "./ports";
import {
  ensureOwnBookableSpecialist as ensureOwnBookableSpecialistCore,
  type EnsureOwnBookableSpecialistContext,
  type EnsureOwnBookableSpecialistOptions,
} from "./ensureOwnBookableSpecialist";

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function createOrganizationProvisioningService(deps: {
  provisioningPort: OrganizationProvisioningPort;
}) {
  return {
    async createSpecialistSignupIntent(input: SpecialistSignupIntentInput): Promise<void> {
      const organizationTitle = normalizeTitle(input.organizationTitle);
      const specialistFullName = normalizeTitle(input.specialistFullName);
      if (!organizationTitle) {
        throw new Error("organization_title_required");
      }
      if (!specialistFullName) {
        throw new Error("specialist_full_name_required");
      }
      await deps.provisioningPort.createSpecialistSignupIntent({
        ...input,
        organizationTitle,
        specialistFullName,
      });
    },

    async getSpecialistSignupIntentByChallengeId(challengeId: string) {
      return deps.provisioningPort.getSpecialistSignupIntentByChallengeId(challengeId);
    },

    async getLatestSpecialistSignupIntentForUser(userId: string) {
      return deps.provisioningPort.getLatestSpecialistSignupIntentForUser(userId);
    },

    async replacePendingSpecialistSignupChallenge(input: { userId: string; challengeId: string }) {
      return deps.provisioningPort.replacePendingSpecialistSignupChallenge(input);
    },

    async provisionSpecialistOwner(input: {
      userId: string;
      challengeId: string;
    }): Promise<SpecialistOwnerProvisioningResult> {
      return deps.provisioningPort.provisionSpecialistOwner(input);
    },

    async ensureOwnBookableSpecialist(
      ctx: EnsureOwnBookableSpecialistContext,
      options?: EnsureOwnBookableSpecialistOptions,
    ): Promise<string | null> {
      return ensureOwnBookableSpecialistCore(deps.provisioningPort, ctx, options);
    },
  };
}

export type OrganizationProvisioningService = ReturnType<typeof createOrganizationProvisioningService>;
