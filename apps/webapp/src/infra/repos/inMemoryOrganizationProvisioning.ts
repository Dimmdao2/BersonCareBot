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

    async getLatestSpecialistSignupIntentForUser() {
      return intents.at(-1) ?? null;
    },

    async replacePendingSpecialistSignupChallenge({ challengeId }) {
      const intent = [...intents].reverse().find((candidate) => candidate.status === "pending");
      if (!intent) return false;
      intent.challengeId = challengeId;
      return true;
    },

    async provisionSpecialistOwner({ userId, challengeId }) {
      const intent = intents.find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.challengeId === challengeId &&
          (candidate.status === "pending" || candidate.status === "provisioned"),
      );
      if (!intent) {
        throw new Error("specialist_signup_intent_not_found");
      }
      if (
        intent.status === "provisioned" &&
        intent.provisionedOrganizationId &&
        intent.provisionedMembershipId
      ) {
        return {
          organizationId: intent.provisionedOrganizationId,
          specialistId: intent.provisionedSpecialistId,
          membershipId: intent.provisionedMembershipId,
        };
      }
      const organizationId = randomUUID();
      const membershipId = randomUUID();
      intent.status = "provisioned";
      intent.provisionedOrganizationId = organizationId;
      intent.provisionedSpecialistId = null;
      intent.provisionedMembershipId = membershipId;
      return {
        organizationId,
        specialistId: null,
        membershipId,
      };
    },

    async ensureOwnBookableSpecialist() {
      return {
        specialistId: randomUUID(),
        created: true,
      };
    },
  };
}
