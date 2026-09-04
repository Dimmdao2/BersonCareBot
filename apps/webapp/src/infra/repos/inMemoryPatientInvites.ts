import type {
  PatientInviteRecord,
  PatientInvitesPort,
  PatientPortalStatus,
  PatientInviteRecipientBinding,
} from '@/modules/patient-invites/ports';

type StoredInvite = PatientInviteRecord & {
  tokenHash: string;
  invitedEmailNormalized: string | null;
  recipientBinding: PatientInviteRecipientBinding;
  bearerExchangedAt: string | null;
  continuationHash: string | null;
  continuationExpiresAt: string | null;
  proofEmailNormalized: string | null;
  proofCodeHash: string | null;
  proofStartedAt: string | null;
  proofExpiresAt: string | null;
  proofAttempts: number;
  proofVerifiedAt: string | null;
  organizationTitle: string;
  acceptedByPlatformUserId: string | null;
  acceptedVia: 'email_otp' | null;
  revokedByPlatformUserId: string | null;
  supersededByInviteId: string | null;
};

type EnrollmentState = {
  status: 'invited' | 'active' | 'inactive';
  portalActivatedAt: string | null;
  portalActivatedVia: 'patient_invite_email_otp' | null;
};

const invites: StoredInvite[] = [];
const enrollments = new Map<string, EnrollmentState>();
const emailOwners = new Map<string, string>();

function key(organizationId: string, patientUserId: string): string {
  return `${organizationId}:${patientUserId}`;
}

function publicRecord(invite: StoredInvite): PatientInviteRecord {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    patientUserId: invite.patientUserId,
    enrollmentId: invite.enrollmentId,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    recipientBinding: invite.recipientBinding,
  };
}

function preview(invite: StoredInvite) {
  const [local = '', domain = ''] = (invite.invitedEmailNormalized ?? '').split('@');
  return {
    organizationTitle: invite.organizationTitle,
    recipientHint:
      invite.recipientBinding === 'bound_email' ? `${local[0] ?? '*'}***@${domain}` : null,
    inviteExpiresAt: invite.expiresAt,
    recipientBinding: invite.recipientBinding,
  };
}

function lifecycleFailure(invite: StoredInvite) {
  if (invite.status === 'accepted') return { ok: false as const, code: 'already_linked' as const };
  if (invite.status === 'revoked') return { ok: false as const, code: 'revoked_token' as const };
  if (invite.status === 'superseded')
    return { ok: false as const, code: 'superseded_token' as const };
  if (invite.status === 'expired' || Date.parse(invite.expiresAt) <= Date.now()) {
    invite.status = 'expired';
    return { ok: false as const, code: 'expired_token' as const };
  }
  return null;
}

export function resetInMemoryPatientInvitesForTests(): void {
  invites.length = 0;
  enrollments.clear();
  emailOwners.clear();
}

export function setInMemoryPatientInviteEmailOwnerForTests(
  emailNormalized: string,
  patientUserId: string,
): void {
  emailOwners.set(emailNormalized, patientUserId);
}

export function setInMemoryPatientInviteEnrollmentForTests(input: {
  organizationId: string;
  patientUserId: string;
  status: 'invited' | 'active' | 'inactive';
  portalActivated?: boolean;
}): void {
  enrollments.set(key(input.organizationId, input.patientUserId), {
    status: input.status,
    portalActivatedAt: input.portalActivated ? new Date().toISOString() : null,
    portalActivatedVia: null,
  });
}

export function createInMemoryPatientInvitesPort(): PatientInvitesPort {
  function relationship(organizationId: string, patientUserId: string): EnrollmentState {
    return (
      enrollments.get(key(organizationId, patientUserId)) ?? {
        status: 'invited',
        portalActivatedAt: null,
        portalActivatedVia: null,
      }
    );
  }

  function portalStatus(organizationId: string, patientUserId: string): PatientPortalStatus {
    const enrollment = relationship(organizationId, patientUserId);
    if (enrollment.portalActivatedAt) return 'linked';
    const pending = invites.some(
      (invite) =>
        invite.organizationId === organizationId &&
        invite.patientUserId === patientUserId &&
        invite.status === 'pending' &&
        Date.parse(invite.expiresAt) > Date.now(),
    );
    return pending ? 'invited' : 'not_activated';
  }

  function byContinuation(continuationHash: string): StoredInvite | undefined {
    return invites.find((candidate) => candidate.continuationHash === continuationHash);
  }

  return {
    async getPortalStatus({ organizationId, patientUserId }) {
      const pending = invites.find(
        (invite) =>
          invite.organizationId === organizationId &&
          invite.patientUserId === patientUserId &&
          invite.status === 'pending' &&
          Date.parse(invite.expiresAt) > Date.now(),
      );
      return {
        status: portalStatus(organizationId, patientUserId),
        inviteId: pending?.id ?? null,
        expiresAt: pending?.expiresAt ?? null,
      };
    },

    async listPortalLinkedPatients({ organizationId, patientUserIds }) {
      return patientUserIds.filter(
        (patientUserId) => portalStatus(organizationId, patientUserId) === 'linked',
      );
    },

    async createReplacingPending(input) {
      const enrollment = relationship(input.organizationId, input.patientUserId);
      if (enrollment.portalActivatedAt) return { ok: false, code: 'already_linked' };
      if (enrollment.status !== 'invited' && enrollment.status !== 'active') {
        return { ok: false, code: 'inactive_relationship' };
      }

      const previous = invites.find(
        (invite) =>
          invite.organizationId === input.organizationId &&
          invite.patientUserId === input.patientUserId &&
          invite.status === 'pending',
      );
      if (previous) {
        previous.status = 'superseded';
        previous.proofCodeHash = null;
        previous.proofExpiresAt = null;
      }

      const invite: StoredInvite = {
        id: input.id,
        organizationId: input.organizationId,
        patientUserId: input.patientUserId,
        enrollmentId: `enrollment:${input.organizationId}:${input.patientUserId}`,
        status: 'pending',
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        tokenHash: input.tokenHash,
        invitedEmailNormalized: input.invitedEmailNormalized,
        recipientBinding: input.recipientBinding,
        bearerExchangedAt: null,
        continuationHash: null,
        continuationExpiresAt: null,
        proofEmailNormalized: null,
        proofCodeHash: null,
        proofStartedAt: null,
        proofExpiresAt: null,
        proofAttempts: 0,
        proofVerifiedAt: null,
        organizationTitle: 'Тестовая клиника',
        acceptedByPlatformUserId: null,
        acceptedVia: null,
        revokedByPlatformUserId: null,
        supersededByInviteId: null,
      };
      invites.push(invite);
      if (previous) previous.supersededByInviteId = invite.id;
      return { ok: true, invite: publicRecord(invite) };
    },

    async revokePending({ organizationId, patientUserId, inviteId, revokedByPlatformUserId }) {
      const invite = invites.find(
        (candidate) =>
          candidate.id === inviteId &&
          candidate.organizationId === organizationId &&
          candidate.patientUserId === patientUserId &&
          candidate.status === 'pending',
      );
      if (!invite) return false;
      invite.status = 'revoked';
      invite.revokedByPlatformUserId = revokedByPlatformUserId;
      invite.proofCodeHash = null;
      invite.proofExpiresAt = null;
      return true;
    },

    async exchangeBearer({ tokenHash, continuationHash, continuationExpiresAt }) {
      const invite = invites.find((candidate) => candidate.tokenHash === tokenHash);
      if (!invite) return { ok: false, code: 'invalid_token' };
      const lifecycle = lifecycleFailure(invite);
      if (lifecycle) return lifecycle;
      if (invite.bearerExchangedAt) return { ok: false, code: 'exchanged_token' };
      const enrollment = relationship(invite.organizationId, invite.patientUserId);
      if (enrollment.portalActivatedAt) return { ok: false, code: 'already_linked' };
      if (enrollment.status !== 'invited' && enrollment.status !== 'active') {
        return { ok: false, code: 'inactive_relationship' };
      }
      invite.bearerExchangedAt = new Date().toISOString();
      invite.continuationHash = continuationHash;
      invite.continuationExpiresAt = continuationExpiresAt;
      return { ok: true, preview: preview(invite) };
    },

    async lookupContinuation(continuationHash) {
      const invite = byContinuation(continuationHash);
      if (!invite) return { ok: false, code: 'invalid_continuation' };
      if (invite.status === 'accepted') {
        const enrollment = relationship(invite.organizationId, invite.patientUserId);
        if (
          invite.recipientBinding !== 'unbound_email_claim' ||
          invite.acceptedByPlatformUserId !== invite.patientUserId ||
          invite.acceptedVia !== 'email_otp' ||
          !invite.proofVerifiedAt ||
          !invite.proofCodeHash ||
          !invite.proofExpiresAt ||
          Date.parse(invite.proofExpiresAt) <= Date.now() ||
          !enrollment.portalActivatedAt ||
          enrollment.portalActivatedVia !== 'patient_invite_email_otp'
        ) {
          return { ok: false, code: 'already_linked' };
        }
      } else {
        const lifecycle = lifecycleFailure(invite);
        if (lifecycle) return lifecycle;
      }
      if (!invite.continuationExpiresAt || Date.parse(invite.continuationExpiresAt) <= Date.now()) {
        return { ok: false, code: 'invalid_continuation' };
      }
      return { ok: true, preview: preview(invite) };
    },

    async startEmailProof({ continuationHash, emailNormalized, codeHash, proofExpiresAt }) {
      const invite = byContinuation(continuationHash);
      if (!invite || lifecycleFailure(invite)) return { ok: false, code: 'invalid_continuation' };
      if (
        invite.recipientBinding === 'bound_email' &&
        invite.invitedEmailNormalized !== emailNormalized
      )
        return { ok: false, code: 'wrong_recipient' };
      if (invite.proofStartedAt && Date.parse(invite.proofStartedAt) > Date.now() - 30_000) {
        return { ok: false, code: 'rate_limited' };
      }
      invite.proofEmailNormalized = emailNormalized;
      invite.proofCodeHash = codeHash;
      invite.proofStartedAt = new Date().toISOString();
      invite.proofExpiresAt = proofExpiresAt;
      invite.proofAttempts = 0;
      invite.proofVerifiedAt = null;
      return { ok: true };
    },

    async cancelEmailProof({ continuationHash, codeHash }) {
      const invite = byContinuation(continuationHash);
      if (!invite || invite.proofCodeHash !== codeHash) return false;
      invite.proofCodeHash = null;
      invite.proofStartedAt = null;
      invite.proofExpiresAt = null;
      return true;
    },

    async verifyEmailProof({ continuationHash, emailNormalized, codeHash }) {
      const invite = byContinuation(continuationHash);
      if (!invite) return { ok: false, code: 'invalid_continuation' };
      if (invite.status === 'accepted') {
        if (
          invite.recipientBinding === 'unbound_email_claim' &&
          invite.acceptedByPlatformUserId === invite.patientUserId &&
          invite.acceptedVia === 'email_otp' &&
          invite.proofVerifiedAt &&
          invite.proofEmailNormalized === emailNormalized &&
          invite.proofCodeHash === codeHash &&
          invite.proofExpiresAt &&
          Date.parse(invite.proofExpiresAt) > Date.now()
        ) {
          return { ok: true };
        }
        return { ok: false, code: 'invalid_code' };
      }
      if (lifecycleFailure(invite)) return { ok: false, code: 'invalid_continuation' };
      if (invite.proofAttempts >= 5) return { ok: false, code: 'too_many_attempts' };
      if (!invite.proofExpiresAt || Date.parse(invite.proofExpiresAt) <= Date.now()) {
        return { ok: false, code: 'expired_code' };
      }
      if (
        invite.proofEmailNormalized !== emailNormalized ||
        (invite.recipientBinding === 'bound_email' &&
          invite.invitedEmailNormalized !== emailNormalized) ||
        invite.proofCodeHash !== codeHash
      ) {
        invite.proofAttempts += 1;
        return { ok: false, code: 'invalid_code' };
      }
      invite.proofVerifiedAt = new Date().toISOString();
      return { ok: true };
    },

    async redeemEmailProof({ continuationHash, authenticatedPlatformUserId }) {
      const invite = byContinuation(continuationHash);
      if (!invite) return { ok: false, code: 'invalid_continuation' };
      const lifecycle = lifecycleFailure(invite);
      if (lifecycle) return lifecycle;
      if (!invite.proofVerifiedAt) return { ok: false, code: 'unproved_identity' };
      if (invite.patientUserId !== authenticatedPlatformUserId) {
        return { ok: false, code: 'conflicting_identity' };
      }
      const enrollment = relationship(invite.organizationId, invite.patientUserId);
      if (enrollment.portalActivatedAt) return { ok: false, code: 'already_linked' };
      if (enrollment.status !== 'invited' && enrollment.status !== 'active') {
        return { ok: false, code: 'inactive_relationship' };
      }
      enrollments.set(key(invite.organizationId, invite.patientUserId), {
        status: 'active',
        portalActivatedAt: new Date().toISOString(),
        portalActivatedVia: 'patient_invite_email_otp',
      });
      invite.status = 'accepted';
      invite.acceptedByPlatformUserId = invite.patientUserId;
      invite.acceptedVia = 'email_otp';
      return { ok: true, organizationId: invite.organizationId };
    },

    async claimUnboundEmailProof({ continuationHash, emailNormalized }) {
      const invite = byContinuation(continuationHash);
      if (!invite) return { ok: false, code: 'invalid_continuation' };
      if (invite.status === 'accepted') {
        const owner = emailOwners.get(emailNormalized);
        if (
          invite.recipientBinding === 'unbound_email_claim' &&
          invite.acceptedByPlatformUserId === invite.patientUserId &&
          invite.acceptedVia === 'email_otp' &&
          invite.proofVerifiedAt &&
          invite.proofEmailNormalized === emailNormalized &&
          invite.proofCodeHash &&
          invite.proofExpiresAt &&
          Date.parse(invite.proofExpiresAt) > Date.now() &&
          owner === invite.patientUserId &&
          relationship(invite.organizationId, invite.patientUserId).portalActivatedVia ===
            'patient_invite_email_otp'
        ) {
          return {
            ok: true,
            organizationId: invite.organizationId,
            patientUserId: invite.patientUserId,
          };
        }
        return { ok: false, code: 'conflicting_identity' };
      }
      const lifecycle = lifecycleFailure(invite);
      if (lifecycle) return lifecycle;
      if (invite.recipientBinding !== 'unbound_email_claim') {
        return { ok: false, code: 'invalid_invite' };
      }
      if (!invite.proofVerifiedAt || invite.proofEmailNormalized !== emailNormalized) {
        return { ok: false, code: 'unproved_identity' };
      }
      const owner = emailOwners.get(emailNormalized);
      if (owner && owner !== invite.patientUserId) {
        return { ok: false, code: 'conflicting_identity' };
      }
      const enrollment = relationship(invite.organizationId, invite.patientUserId);
      if (enrollment.portalActivatedAt) return { ok: false, code: 'already_linked' };
      if (enrollment.status !== 'invited' && enrollment.status !== 'active') {
        return { ok: false, code: 'inactive_relationship' };
      }
      emailOwners.set(emailNormalized, invite.patientUserId);
      enrollments.set(key(invite.organizationId, invite.patientUserId), {
        status: 'active',
        portalActivatedAt: new Date().toISOString(),
        portalActivatedVia: 'patient_invite_email_otp',
      });
      invite.status = 'accepted';
      invite.acceptedByPlatformUserId = invite.patientUserId;
      invite.acceptedVia = 'email_otp';
      return {
        ok: true,
        organizationId: invite.organizationId,
        patientUserId: invite.patientUserId,
      };
    },
  };
}
