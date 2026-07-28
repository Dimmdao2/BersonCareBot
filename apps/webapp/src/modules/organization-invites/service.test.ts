import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateOrganizationInviteInput,
  OrganizationInviteRecord,
  OrganizationInvitesPort,
} from './ports';
import { createOrganizationInvitesService } from './service';

function invite(overrides: Partial<OrganizationInviteRecord> = {}): OrganizationInviteRecord {
  return {
    id: 'invite-1',
    organizationId: 'org-1',
    invitedEmail: 'doctor@example.com',
    invitedRole: 'doctor',
    status: 'pending',
    expiresAt: '2026-07-26T12:00:00.000Z',
    createdByPlatformUserId: 'owner-1',
    acceptedByPlatformUserId: null,
    acceptedMembershipId: null,
    createdAt: '2026-07-19T12:00:00.000Z',
    acceptedAt: null,
    organizationTitle: 'Clinic',
    ...overrides,
  };
}

function createPort(): OrganizationInvitesPort {
  return {
    createReplacingPending: vi.fn(async (input: CreateOrganizationInviteInput) => ({
      ok: true as const,
      invite: invite({
        invitedEmail: input.invitedEmail,
        invitedRole: input.invitedRole,
        expiresAt: input.expiresAt,
      }),
    })),
    listPendingByOrganization: vi.fn(async () => []),
    countSeatReservationsByOrganization: vi.fn(async () => 0),
    getByTokenHash: vi.fn(async () => null),
    expireInvite: vi.fn(async () => undefined),
    revokePendingByOrganization: vi.fn(async () => true),
    acceptPendingByTokenHash: vi.fn(async () => ({
      ok: true as const,
      organizationId: 'org-1',
      membershipId: 'membership-1',
      platformUserId: 'user-1',
      specialistId: null,
      role: 'doctor' as const,
    })),
  };
}

describe('createOrganizationInvitesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  });

  it('normalizes the email and creates a seven-day invite', async () => {
    const port = createPort();
    const service = createOrganizationInvitesService({ invitesPort: port });

    await expect(
      service.createInvite({
        organizationId: 'org-1',
        email: ' Doctor@Example.COM ',
        role: 'doctor',
        createdByPlatformUserId: 'owner-1',
      }),
    ).resolves.toMatchObject({ ok: true, token: expect.any(String) });

    expect(port.createReplacingPending).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        invitedEmail: 'doctor@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-26T12:00:00.000Z',
        tokenHash: expect.any(String),
      }),
    );
  });

  it('expires a looked-up pending invite before it can be accepted', async () => {
    const port = createPort();
    vi.mocked(port.getByTokenHash).mockResolvedValueOnce(
      invite({
        expiresAt: '2026-07-19T11:59:59.999Z',
      }),
    );
    const service = createOrganizationInvitesService({ invitesPort: port });

    await expect(service.lookupPendingByToken('token')).resolves.toEqual({
      ok: false,
      code: 'expired_token',
    });
    expect(port.expireInvite).toHaveBeenCalledWith('invite-1');
  });

  it('uses the confirmed normalized email for acceptance', async () => {
    const port = createPort();
    const service = createOrganizationInvitesService({ invitesPort: port });

    await expect(
      service.acceptInvite({
        token: 'token',
        platformUserId: 'existing-user-1',
        expectedEmail: ' Doctor@Example.COM ',
      }),
    ).resolves.toMatchObject({ ok: true, specialistId: null, role: 'doctor' });

    expect(port.acceptPendingByTokenHash).toHaveBeenCalledWith({
      tokenHash: expect.any(String),
      platformUserId: 'existing-user-1',
      expectedEmail: 'doctor@example.com',
    });
  });
});
