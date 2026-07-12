import { randomUUID } from "node:crypto";
import type {
  OrganizationProvisioningPort,
  SpecialistSignupIntent,
} from "@/modules/organization-provisioning/ports";

const intents: SpecialistSignupIntent[] = [];

export function resetInMemoryOrganizationProvisioningForTests(): void {
  intents.length = 0;
}

export function createInMemoryOrganizationProvisioningPort(): OrganizationProvisioningPort {
  return {
    async createSpecialistSignupIntent(input) {
      intents.push({
        ...input,
        id: randomUUID(),
        status: "pending",
        provisionedOrganizationId: null,
        provisionedSpecialistId: null,
        provisionedMembershipId: null,
      });
    },

    async getPendingSpecialistSignupIntent({ userId, challengeId }) {
      return (
        intents.find(
          (intent) =>
            intent.userId === userId && intent.challengeId === challengeId && intent.status === "pending",
        ) ?? null
      );
    },

    async getSpecialistSignupIntentByChallengeId(challengeId) {
      return intents.find((intent) => intent.challengeId === challengeId) ?? null;
    },

    async provisionSpecialistOwner({ userId, challengeId }) {
      const intent = intents.find(
        (candidate) =>
          candidate.userId === userId && candidate.challengeId === challengeId && candidate.status === "pending",
      );
      if (!intent) {
        throw new Error("specialist_signup_intent_not_found");
      }
      if (
        intent.status === "provisioned" &&
        intent.provisionedOrganizationId &&
        intent.provisionedSpecialistId &&
        intent.provisionedMembershipId
      ) {
        return {
          organizationId: intent.provisionedOrganizationId,
          specialistId: intent.provisionedSpecialistId,
          membershipId: intent.provisionedMembershipId,
        };
      }
      const organizationId = randomUUID();
      const specialistId = randomUUID();
      const membershipId = randomUUID();
      intent.status = "provisioned";
      intent.provisionedOrganizationId = organizationId;
      intent.provisionedSpecialistId = specialistId;
      intent.provisionedMembershipId = membershipId;
      return {
        organizationId,
        specialistId,
        membershipId,
      };
    },
  };
}
