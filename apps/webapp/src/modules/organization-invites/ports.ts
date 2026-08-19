export const ORGANIZATION_INVITE_ROLES = ['admin', 'doctor'] as const;
export type OrganizationInviteRole = (typeof ORGANIZATION_INVITE_ROLES)[number];

export const ORGANIZATION_INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
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

/** §5a item 5.1 — present only when this invite was the tariff-configured price beyond includedSeats. */
export type SeatOveragePricing = { priceMinor: number; currency: string };

export type CreateOrganizationInviteResult =
  | { ok: true; invite: OrganizationInviteRecord }
  | {
      ok: false;
      /** `seat_overage_paid_period_over` — Р-15: остатка оплаченного периода нет, продавать не во что. */
      code: 'already_member' | 'seat_limit_reached' | 'seat_overage_paid_period_over';
    }
  | {
      ok: false;
      code: 'seat_overage_confirmation_required';
      priceMinor: number;
      currency: string;
      /** Момент из того же предложения двери, до которого цена неподвижна, — срок котировки (Р-15). */
      priceStableUntil: string;
    };

export type AcceptOrganizationInviteResult =
  | {
      ok: true;
      organizationId: string;
      membershipId: string;
      platformUserId: string;
      specialistId: string | null;
      role: OrganizationInviteRole;
    }
  | {
      ok: false;
      code:
        | 'invalid_token'
        | 'expired_token'
        | 'reused_token'
        | 'email_mismatch'
        | 'entitlement_disabled'
        | 'seat_limit_reached';
    };

export type OrganizationInvitesPort = {
  createReplacingPending(
    input: CreateOrganizationInviteInput,
  ): Promise<CreateOrganizationInviteResult>;
  listPendingByOrganization(organizationId: string): Promise<OrganizationInviteRecord[]>;
  /** Pending doctor invites plus accepted doctor invites awaiting their specialist binding. */
  countSeatReservationsByOrganization(organizationId: string): Promise<number>;
  getByTokenHash(tokenHash: string): Promise<OrganizationInviteRecord | null>;
  expireInvite(inviteId: string): Promise<void>;
  revokePendingByOrganization(input: {
    organizationId: string;
    inviteId: string;
  }): Promise<boolean>;
  acceptPendingByTokenHash(input: {
    tokenHash: string;
    platformUserId: string;
    expectedEmail: string;
  }): Promise<AcceptOrganizationInviteResult>;
};
