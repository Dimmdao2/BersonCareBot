export type SpecialistSignupIntentInput = {
  userId: string;
  challengeId: string;
  emailNormalized: string;
  organizationTitle: string;
  specialistFullName: string;
};

export type SpecialistSignupIntent = SpecialistSignupIntentInput & {
  id: string;
  status: "pending" | "provisioned";
  provisionedOrganizationId: string | null;
  provisionedSpecialistId: string | null;
  provisionedMembershipId: string | null;
};

export type SpecialistOwnerProvisioningInput = {
  userId: string;
  challengeId: string;
};

export type SpecialistOwnerProvisioningResult = {
  organizationId: string;
  specialistId: string | null;
  membershipId: string;
};

export type EnsureOwnBookableSpecialistInput = {
  organizationId: string;
  membershipId: string;
  fullName: string;
};

export type EnsureOwnBookableSpecialistResult = {
  specialistId: string | null;
  created: boolean;
};

export type OrganizationProvisioningPort = {
  createSpecialistSignupIntent(input: SpecialistSignupIntentInput): Promise<void>;
  getPendingSpecialistSignupIntent(input: {
    userId: string;
    challengeId: string;
  }): Promise<SpecialistSignupIntent | null>;
  getSpecialistSignupIntentByChallengeId(challengeId: string): Promise<SpecialistSignupIntent | null>;
  provisionSpecialistOwner(input: SpecialistOwnerProvisioningInput): Promise<SpecialistOwnerProvisioningResult>;
  ensureOwnBookableSpecialist(
    input: EnsureOwnBookableSpecialistInput,
  ): Promise<EnsureOwnBookableSpecialistResult>;
};
