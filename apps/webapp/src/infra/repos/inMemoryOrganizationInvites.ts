import { randomUUID } from 'node:crypto';
import type {
  AcceptOrganizationInviteResult,
  CreateOrganizationInviteResult,
  OrganizationInviteRecord,
  OrganizationInvitesPort,
} from '@/modules/organization-invites/ports';

const invites: Array<OrganizationInviteRecord & { tokenHash: string }> = [];

export function resetInMemoryOrganizationInvitesForTests(): void {
  invites.length = 0;
}

export function createInMemoryOrganizationInvitesPort(): OrganizationInvitesPort {
  return {
    async createReplacingPending(input): Promise<CreateOrganizationInviteResult> {
      const existingActive = invites.find(
        (invite) =>
          invite.organizationId === input.organizationId &&
          invite.invitedEmail === input.invitedEmail &&
          invite.status === 'accepted',
      );
      if (existingActive) {
        return { ok: false, code: 'already_member' };
      }

      for (const invite of invites) {
        if (
          invite.organizationId === input.organizationId &&
          invite.invitedEmail === input.invitedEmail &&
          invite.status === 'pending'
        ) {
          invite.status = 'revoked';
        }
      }

      const now = new Date().toISOString();
      const invite: OrganizationInviteRecord & { tokenHash: string } = {
        id: randomUUID(),
        organizationId: input.organizationId,
        invitedEmail: input.invitedEmail,
        invitedRole: input.invitedRole,
        status: 'pending',
        expiresAt: input.expiresAt,
        createdByPlatformUserId: input.createdByPlatformUserId,
        acceptedByPlatformUserId: null,
        acceptedMembershipId: null,
        createdAt: now,
        acceptedAt: null,
        organizationTitle: null,
        tokenHash: input.tokenHash,
      };
      invites.push(invite);
      return { ok: true, invite };
    },

    async listPendingByOrganization(organizationId) {
      const now = Date.now();
      return invites.filter(
        (invite) =>
          invite.organizationId === organizationId &&
          invite.status === 'pending' &&
          new Date(invite.expiresAt).getTime() > now,
      );
    },

    async countSeatReservationsByOrganization(organizationId) {
      const now = Date.now();
      return invites.filter(
        (invite) =>
          invite.organizationId === organizationId &&
          invite.invitedRole === 'doctor' &&
          ((invite.status === 'pending' && new Date(invite.expiresAt).getTime() > now) ||
            invite.status === 'accepted'),
      ).length;
    },

    async getByTokenHash(tokenHash) {
      return invites.find((invite) => invite.tokenHash === tokenHash) ?? null;
    },

    async expireInvite(inviteId) {
      const invite = invites.find((candidate) => candidate.id === inviteId);
      if (invite?.status === 'pending') invite.status = 'expired';
    },

    async revokePendingByOrganization({ organizationId, inviteId }) {
      const invite = invites.find(
        (candidate) =>
          candidate.id === inviteId &&
          candidate.organizationId === organizationId &&
          candidate.status === 'pending',
      );
      if (!invite) return false;
      invite.status = 'revoked';
      return true;
    },

    async acceptPendingByTokenHash({
      tokenHash,
      platformUserId,
      expectedEmail,
    }): Promise<AcceptOrganizationInviteResult> {
      const invite = invites.find((candidate) => candidate.tokenHash === tokenHash);
      if (!invite) return { ok: false, code: 'invalid_token' };
      if (invite.status !== 'pending') return { ok: false, code: 'reused_token' };
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        invite.status = 'expired';
        return { ok: false, code: 'expired_token' };
      }
      if (invite.invitedEmail !== expectedEmail) {
        return { ok: false, code: 'email_mismatch' };
      }
      const membershipId = randomUUID();
      // Invite acceptance is deliberately pre-session. The doctor specialist is
      // provisioned idempotently by the first valid staff workspace entrypoint.
      const specialistId = null;
      invite.status = 'accepted';
      invite.acceptedByPlatformUserId = platformUserId;
      invite.acceptedMembershipId = membershipId;
      invite.acceptedAt = new Date().toISOString();
      return {
        ok: true,
        organizationId: invite.organizationId,
        membershipId,
        platformUserId,
        specialistId,
        role: invite.invitedRole,
      };
    },
  };
}
