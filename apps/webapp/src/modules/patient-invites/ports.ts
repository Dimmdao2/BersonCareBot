export type PatientPortalStatus = 'not_activated' | 'invited' | 'linked';
export type PatientInviteRecipientBinding = 'bound_email' | 'unbound_email_claim';

export type PatientInviteRecord = {
  id: string;
  organizationId: string;
  patientUserId: string;
  enrollmentId: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | 'superseded';
  expiresAt: string;
  createdAt: string;
  recipientBinding: PatientInviteRecipientBinding;
};

export type PatientInvitePublicPreview = {
  organizationTitle: string;
  recipientHint: string | null;
  inviteExpiresAt: string;
  recipientBinding: PatientInviteRecipientBinding;
};

export type PatientInviteLifecycleCode =
  | 'invalid_token'
  | 'invalid_continuation'
  | 'expired_token'
  | 'revoked_token'
  | 'superseded_token'
  | 'exchanged_token'
  | 'already_linked'
  | 'wrong_recipient'
  | 'missing_recipient'
  | 'invalid_invite'
  | 'unproved_identity'
  | 'rate_limited'
  | 'conflicting_identity'
  | 'wrong_org'
  | 'organization_unavailable'
  | 'inactive_relationship';

export type PatientInviteFailure = { ok: false; code: PatientInviteLifecycleCode };

export type PatientInvitesPort = {
  getPortalStatus(input: {
    organizationId: string;
    patientUserId: string;
  }): Promise<{ status: PatientPortalStatus; inviteId: string | null; expiresAt: string | null }>;
  /**
   * APPT-DETAIL-11: кто из пациентов уже `linked` к порталу — сразу по набору. Отправка ссылки в
   * чат существует только для них, а карточку деталей открывают из загруженного диапазона.
   */
  listPortalLinkedPatients(input: {
    organizationId: string;
    patientUserIds: string[];
  }): Promise<string[]>;
  createReplacingPending(input: {
    id: string;
    organizationId: string;
    patientUserId: string;
    tokenHash: string;
    invitedEmailNormalized: string | null;
    recipientBinding: PatientInviteRecipientBinding;
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
  startEmailProof(input: {
    continuationHash: string;
    emailNormalized: string;
    codeHash: string;
    proofExpiresAt: string;
    authorizationNonce: string;
    authorizationExpiresEpoch: number;
    authorizationSignature: string;
  }): Promise<{ ok: true } | PatientInviteFailure>;
  cancelEmailProof(input: { continuationHash: string; codeHash: string }): Promise<boolean>;
  verifyEmailProof(input: {
    continuationHash: string;
    emailNormalized: string;
    codeHash: string;
    authorizationNonce: string;
    authorizationExpiresEpoch: number;
    authorizationSignature: string;
  }): Promise<
    | { ok: true }
    | PatientInviteFailure
    | { ok: false; code: 'invalid_code' | 'expired_code' | 'too_many_attempts' }
  >;
  redeemEmailProof(input: {
    continuationHash: string;
    authenticatedPlatformUserId: string;
  }): Promise<{ ok: true; organizationId: string } | PatientInviteFailure>;
  claimUnboundEmailProof(input: {
    continuationHash: string;
    emailNormalized: string;
    authorizationNonce: string;
    authorizationExpiresEpoch: number;
    authorizationSignature: string;
  }): Promise<{ ok: true; organizationId: string; patientUserId: string } | PatientInviteFailure>;
};
