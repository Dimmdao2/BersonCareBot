import { createHash, randomBytes } from 'node:crypto';
import { env, integratorWebhookSecret } from '@/config/env';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import type {
  CreateOrganizationInviteResult,
  OrganizationInviteRecord,
  OrganizationInviteRole,
  OrganizationInvitesPort,
} from './ports';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function emailCodePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || 'test-email-pepper';
}

export function hashOrganizationInviteToken(token: string): string {
  return createHash('sha256').update(`${token}:${emailCodePepper()}`).digest('hex');
}

function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function isExpired(invite: Pick<OrganizationInviteRecord, 'expiresAt'>): boolean {
  return new Date(invite.expiresAt).getTime() <= Date.now();
}

export function createOrganizationInvitesService(deps: { invitesPort: OrganizationInvitesPort }) {
  return {
    async createInvite(input: {
      organizationId: string;
      email: string;
      role: OrganizationInviteRole;
      createdByPlatformUserId: string;
      confirmedSeatOveragePriceMinor?: number;
    }): Promise<CreateOrganizationInviteResult & { token?: string }> {
      const invitedEmail = normalizeEmail(input.email);
      if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
        throw new Error('invalid_email');
      }

      const token = generateInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      const result = await deps.invitesPort.createReplacingPending({
        organizationId: input.organizationId,
        invitedEmail,
        invitedRole: input.role,
        tokenHash: hashOrganizationInviteToken(token),
        expiresAt,
        createdByPlatformUserId: input.createdByPlatformUserId,
        confirmedSeatOveragePriceMinor: input.confirmedSeatOveragePriceMinor,
      });
      if (!result.ok) return result;
      return { ...result, token };
    },

    async listPending(organizationId: string): Promise<OrganizationInviteRecord[]> {
      return deps.invitesPort.listPendingByOrganization(organizationId);
    },

    async lookupPendingByToken(
      token: string,
    ): Promise<
      | { ok: true; invite: OrganizationInviteRecord }
      | { ok: false; code: 'invalid_token' | 'expired_token' | 'reused_token' }
    > {
      const tokenHash = hashOrganizationInviteToken(token);
      const invite = await deps.invitesPort.getByTokenHash(tokenHash);
      if (!invite) return { ok: false, code: 'invalid_token' };
      if (invite.status !== 'pending') return { ok: false, code: 'reused_token' };
      if (isExpired(invite)) {
        await deps.invitesPort.expireInvite(invite.id);
        return { ok: false, code: 'expired_token' };
      }
      return { ok: true, invite };
    },

    async revokeInvite(input: { organizationId: string; inviteId: string }): Promise<boolean> {
      return deps.invitesPort.revokePendingByOrganization(input);
    },

    async acceptInvite(input: { token: string; platformUserId: string; expectedEmail: string }) {
      return deps.invitesPort.acceptPendingByTokenHash({
        tokenHash: hashOrganizationInviteToken(input.token),
        platformUserId: input.platformUserId,
        expectedEmail: normalizeEmail(input.expectedEmail),
      });
    },
  };
}

export type OrganizationInvitesService = ReturnType<typeof createOrganizationInvitesService>;
