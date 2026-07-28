export type SpecialistSignupIntentInput = {
  challengeId: string;
  emailNormalized: string;
  organizationTitle: string;
  organizationSlug: string;
  specialistFullName: string;
};

export type SpecialistSignupIntent = Omit<SpecialistSignupIntentInput, 'organizationSlug'> & {
  id: string;
  userId: string;
  /** Null only for an unfinished intent created before mandatory signup slugs shipped. */
  organizationSlug: string | null;
  status: 'pending' | 'provisioned';
  provisionedOrganizationId: string | null;
  provisionedSpecialistId: string | null;
  provisionedMembershipId: string | null;
};

export type SpecialistOwnerProvisioningInput = {
  challengeId: string;
};

export type SpecialistOwnerProvisioningResult = {
  organizationId: string;
  specialistId: string;
  membershipId: string;
};

export type EnsureOwnBookableSpecialistInput = {
  organizationId: string;
  membershipId: string;
  platformUserId: string;
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
  getSpecialistSignupIntentByChallengeId(
    challengeId: string,
  ): Promise<SpecialistSignupIntent | null>;
  getLatestSpecialistSignupIntentForUser(): Promise<SpecialistSignupIntent | null>;
  replacePendingSpecialistSignupChallenge(input: {
    challengeId: string;
    organizationSlug: string;
  }): Promise<boolean>;
  provisionSpecialistOwner(
    input: SpecialistOwnerProvisioningInput,
  ): Promise<SpecialistOwnerProvisioningResult>;
  ensureOwnBookableSpecialist(
    input: EnsureOwnBookableSpecialistInput,
  ): Promise<EnsureOwnBookableSpecialistResult>;
};
