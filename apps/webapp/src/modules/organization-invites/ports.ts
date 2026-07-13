export const ORGANIZATION_INVITE_ROLES = ["admin", "doctor"] as const;
export type OrganizationInviteRole = (typeof ORGANIZATION_INVITE_ROLES)[number];

export const ORGANIZATION_INVITE_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type OrganizationInviteStatus = (typeof ORGANIZATION_INVITE_STATUSES)[number];

export type OrganizationInviteRecord = {
  id: string;
  organizationId: string;
  invitedEmail: string;
  invitedRole: OrganizationInviteRole;
  status: OrganizationInviteStatus;
  expiresAt: string;
  createdByPlatformUserId: string;
  acceptedByPlatformUserId: string | null;
  acceptedMembershipId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  organizationTitle: string | null;
};

export type CreateOrganizationInviteInput = {
  organizationId: string;
  invitedEmail: string;
  invitedRole: OrganizationInviteRole;
  tokenHash: string;
  expiresAt: string;
  createdByPlatformUserId: string;
};

export type CreateOrganizationInviteResult =
  | { ok: true; invite: OrganizationInviteRecord }
  | { ok: false; code: "already_member" };

export type AcceptOrganizationInviteResult =
  | {
      ok: true;
      organizationId: string;
      membershipId: string;
      platformUserId: string;
      specialistId: string | null;
      role: OrganizationInviteRole;
    }
  | { ok: false; code: "invalid_token" | "expired_token" | "reused_token" | "email_mismatch" };

export type OrganizationInvitesPort = {
  createReplacingPending(input: CreateOrganizationInviteInput): Promise<CreateOrganizationInviteResult>;
  listPendingByOrganization(organizationId: string): Promise<OrganizationInviteRecord[]>;
  getByTokenHash(tokenHash: string): Promise<OrganizationInviteRecord | null>;
  expireInvite(inviteId: string): Promise<void>;
  revokePendingByOrganization(input: { organizationId: string; inviteId: string }): Promise<boolean>;
  acceptPendingByTokenHash(input: {
    tokenHash: string;
    expectedEmail: string;
  }): Promise<AcceptOrganizationInviteResult>;
};
