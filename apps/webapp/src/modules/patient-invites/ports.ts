export type PatientPortalStatus = "not_activated" | "invited" | "linked";

export type PatientInviteRecord = {
  id: string;
  organizationId: string;
  patientUserId: string;
  enrollmentId: string;
  status: "pending" | "accepted" | "expired" | "revoked" | "superseded";
  expiresAt: string;
  createdAt: string;
};

export type PatientInvitePublicPreview = {
  organizationTitle: string;
  recipientHint: string | null;
  inviteExpiresAt: string;
};

export type PatientInviteLifecycleCode =
  | "invalid_token"
  | "invalid_continuation"
  | "expired_token"
  | "revoked_token"
  | "superseded_token"
  | "already_linked"
  | "wrong_recipient"
  | "conflicting_identity"
  | "wrong_org"
  | "organization_unavailable"
  | "inactive_relationship";

export type PatientInviteFailure = { ok: false; code: PatientInviteLifecycleCode };

export type PatientInvitesPort = {
  getPortalStatus(input: {
    organizationId: string;
    patientUserId: string;
  }): Promise<{ status: PatientPortalStatus; inviteId: string | null; expiresAt: string | null }>;
  createReplacingPending(input: {
    id: string;
    organizationId: string;
    patientUserId: string;
    tokenHash: string;
    invitedEmailNormalized: string | null;
    expiresAt: string;
    createdByPlatformUserId: string;
  }): Promise<{ ok: true; invite: PatientInviteRecord } | PatientInviteFailure>;
  revokePending(input: {
    organizationId: string;
    patientUserId: string;
    inviteId: string;
    revokedByPlatformUserId: string;
  }): Promise<boolean>;
  exchangeBearer(input: {
    tokenHash: string;
    continuationHash: string;
    continuationExpiresAt: string;
  }): Promise<{ ok: true; preview: PatientInvitePublicPreview } | PatientInviteFailure>;
  lookupContinuation(
    continuationHash: string,
  ): Promise<{ ok: true; preview: PatientInvitePublicPreview } | PatientInviteFailure>;
  prepareEmailProof(input: {
    continuationHash: string;
    emailNormalized: string;
  }): Promise<{ ok: true; patientUserId: string } | PatientInviteFailure>;
  bindEmailChallenge(input: {
    continuationHash: string;
    emailNormalized: string;
    challengeId: string;
  }): Promise<boolean>;
  readEmailProof(
    continuationHash: string,
  ): Promise<{ patientUserId: string; challengeId: string; emailNormalized: string } | null>;
  redeemEmailProof(input: {
    continuationHash: string;
    challengeId: string;
    emailNormalized: string;
  }): Promise<
    | { ok: true; platformUserId: string; organizationId: string }
    | PatientInviteFailure
  >;
};
