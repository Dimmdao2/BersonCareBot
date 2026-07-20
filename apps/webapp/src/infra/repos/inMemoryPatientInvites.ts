import type {
  PatientInviteRecord,
  PatientInvitesPort,
  PatientPortalStatus,
} from "@/modules/patient-invites/ports";

type StoredInvite = PatientInviteRecord & {
  tokenHash: string;
  invitedEmailNormalized: string | null;
  continuationHash: string | null;
  continuationExpiresAt: string | null;
  proofEmailNormalized: string | null;
  proofChallengeId: string | null;
  organizationTitle: string;
  revokedByPlatformUserId: string | null;
};

const invites: StoredInvite[] = [];
const enrollmentStatuses = new Map<string, "invited" | "active" | "inactive">();

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
  };
}

export function resetInMemoryPatientInvitesForTests(): void {
  invites.length = 0;
  enrollmentStatuses.clear();
}

export function setInMemoryPatientInviteEnrollmentForTests(input: {
  organizationId: string;
  patientUserId: string;
  status: "invited" | "active" | "inactive";
}): void {
  enrollmentStatuses.set(key(input.organizationId, input.patientUserId), input.status);
}

export function createInMemoryPatientInvitesPort(): PatientInvitesPort {
  function relationship(organizationId: string, patientUserId: string) {
    return enrollmentStatuses.get(key(organizationId, patientUserId)) ?? "invited";
  }

  function portalStatus(organizationId: string, patientUserId: string): PatientPortalStatus {
    const enrollment = relationship(organizationId, patientUserId);
    if (enrollment === "active") return "linked";
    const pending = invites.some(
      (invite) =>
        invite.organizationId === organizationId &&
        invite.patientUserId === patientUserId &&
        invite.status === "pending" &&
        Date.parse(invite.expiresAt) > Date.now(),
    );
    return pending ? "invited" : "not_activated";
  }

  return {
    async getPortalStatus({ organizationId, patientUserId }) {
      const pending = invites.find(
        (invite) =>
          invite.organizationId === organizationId &&
          invite.patientUserId === patientUserId &&
          invite.status === "pending" &&
          Date.parse(invite.expiresAt) > Date.now(),
      );
      return {
        status: portalStatus(organizationId, patientUserId),
        inviteId: pending?.id ?? null,
        expiresAt: pending?.expiresAt ?? null,
      };
    },

    async createReplacingPending(input) {
      const enrollment = relationship(input.organizationId, input.patientUserId);
      if (enrollment === "active") return { ok: false, code: "already_linked" };
      if (enrollment !== "invited") return { ok: false, code: "inactive_relationship" };
      for (const invite of invites) {
        if (
          invite.organizationId === input.organizationId &&
          invite.patientUserId === input.patientUserId &&
          invite.status === "pending"
        ) {
          invite.status = "superseded";
          invite.continuationHash = null;
          invite.continuationExpiresAt = null;
        }
      }
      const invite: StoredInvite = {
        id: input.id,
        organizationId: input.organizationId,
        patientUserId: input.patientUserId,
        enrollmentId: `enrollment:${input.organizationId}:${input.patientUserId}`,
        status: "pending",
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        tokenHash: input.tokenHash,
        invitedEmailNormalized: input.invitedEmailNormalized,
        continuationHash: null,
        continuationExpiresAt: null,
        proofEmailNormalized: null,
        proofChallengeId: null,
        organizationTitle: "Тестовая клиника",
        revokedByPlatformUserId: null,
      };
      invites.push(invite);
      return { ok: true, invite: publicRecord(invite) };
    },

    async revokePending({ organizationId, patientUserId, inviteId, revokedByPlatformUserId }) {
      const invite = invites.find(
        (candidate) =>
          candidate.id === inviteId &&
          candidate.organizationId === organizationId &&
          candidate.patientUserId === patientUserId &&
          candidate.status === "pending",
      );
      if (!invite) return false;
      invite.status = "revoked";
      invite.revokedByPlatformUserId = revokedByPlatformUserId;
      invite.continuationHash = null;
      invite.continuationExpiresAt = null;
      return true;
    },

    async exchangeBearer({ tokenHash, continuationHash, continuationExpiresAt }) {
      const invite = invites.find((candidate) => candidate.tokenHash === tokenHash);
      if (!invite) return { ok: false, code: "invalid_token" };
      if (invite.status === "accepted") return { ok: false, code: "already_linked" };
      if (invite.status === "revoked") return { ok: false, code: "revoked_token" };
      if (invite.status === "superseded") return { ok: false, code: "superseded_token" };
      if (invite.status === "expired" || Date.parse(invite.expiresAt) <= Date.now()) {
        invite.status = "expired";
        return { ok: false, code: "expired_token" };
      }
      invite.continuationHash = continuationHash;
      invite.continuationExpiresAt = continuationExpiresAt;
      return {
        ok: true,
        preview: {
          organizationTitle: invite.organizationTitle,
          recipientHint: invite.invitedEmailNormalized
            ? `${invite.invitedEmailNormalized[0] ?? "*"}***@${invite.invitedEmailNormalized.split("@")[1] ?? ""}`
            : null,
          inviteExpiresAt: invite.expiresAt,
        },
      };
    },

    async lookupContinuation(continuationHash) {
      const invite = invites.find(
        (candidate) =>
          candidate.continuationHash === continuationHash &&
          candidate.status === "pending" &&
          candidate.continuationExpiresAt != null &&
          Date.parse(candidate.continuationExpiresAt) > Date.now(),
      );
      return invite
        ? {
            ok: true,
            preview: {
              organizationTitle: invite.organizationTitle,
              recipientHint: invite.invitedEmailNormalized
                ? `${invite.invitedEmailNormalized[0] ?? "*"}***@${invite.invitedEmailNormalized.split("@")[1] ?? ""}`
                : null,
              inviteExpiresAt: invite.expiresAt,
            },
          }
        : { ok: false, code: "invalid_continuation" };
    },

    async prepareEmailProof({ continuationHash, emailNormalized }) {
      const invite = invites.find(
        (candidate) => candidate.continuationHash === continuationHash && candidate.status === "pending",
      );
      if (!invite) return { ok: false, code: "invalid_continuation" };
      if (invite.invitedEmailNormalized && invite.invitedEmailNormalized !== emailNormalized) {
        return { ok: false, code: "wrong_recipient" };
      }
      invite.proofEmailNormalized = emailNormalized;
      invite.proofChallengeId = null;
      return { ok: true, patientUserId: invite.patientUserId };
    },

    async bindEmailChallenge({ continuationHash, emailNormalized, challengeId }) {
      const invite = invites.find(
        (candidate) =>
          candidate.continuationHash === continuationHash &&
          candidate.status === "pending" &&
          candidate.proofEmailNormalized === emailNormalized,
      );
      if (!invite) return false;
      invite.proofChallengeId = challengeId;
      return true;
    },

    async readEmailProof(continuationHash) {
      const invite = invites.find(
        (candidate) =>
          candidate.continuationHash === continuationHash &&
          candidate.status === "pending" &&
          candidate.proofEmailNormalized != null &&
          candidate.proofChallengeId != null,
      );
      return invite && invite.proofEmailNormalized && invite.proofChallengeId
        ? {
            patientUserId: invite.patientUserId,
            challengeId: invite.proofChallengeId,
            emailNormalized: invite.proofEmailNormalized,
          }
        : null;
    },

    async redeemEmailProof({ continuationHash, challengeId, emailNormalized }) {
      const invite = invites.find(
        (candidate) => candidate.continuationHash === continuationHash && candidate.status === "pending",
      );
      if (!invite) return { ok: false, code: "invalid_continuation" };
      if (invite.proofChallengeId !== challengeId || invite.proofEmailNormalized !== emailNormalized) {
        return { ok: false, code: "wrong_recipient" };
      }
      if (relationship(invite.organizationId, invite.patientUserId) === "active") {
        return { ok: false, code: "already_linked" };
      }
      enrollmentStatuses.set(key(invite.organizationId, invite.patientUserId), "active");
      invite.status = "accepted";
      invite.continuationHash = null;
      invite.continuationExpiresAt = null;
      return {
        ok: true,
        platformUserId: invite.patientUserId,
        organizationId: invite.organizationId,
      };
    },
  };
}
