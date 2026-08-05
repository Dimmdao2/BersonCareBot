import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createOrganizationInvitesService } from './service';
import type { OrganizationInvitesPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const createReplacingPending = vi.fn(async () => ({
    ok: true as const,
    invite: {
      id: 'invite-1',
      organizationId: ORG_ID,
      invitedEmail: 'staff@example.test',
      invitedRole: 'doctor' as const,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      createdByPlatformUserId: 'owner-1',
    },
  }));
  const revokePendingByOrganization = vi.fn(async () => true);
  const invitesPort = {
    createReplacingPending,
    listPendingByOrganization: vi.fn(async () => []),
    getByTokenHash: vi.fn(async () => null),
    expireInvite: vi.fn(async () => undefined),
    revokePendingByOrganization,
    acceptPendingByTokenHash: vi.fn(),
  } satisfies OrganizationInvitesPort;
  const service = createOrganizationInvitesService({
    invitesPort,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, createReplacingPending, revokePendingByOrganization };
}

describe('organization-invites service — 3.2 physical door (clinic_team)', () => {
  it('refuses createInvite when no clinic_team mutation decision ran first', async () => {
    const { service, createReplacingPending } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.createInvite({
          organizationId: ORG_ID,
          email: 'staff@example.test',
          role: 'doctor',
          createdByPlatformUserId: 'owner-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(createReplacingPending).not.toHaveBeenCalled();
  });

  it('refuses revokeInvite when no clinic_team mutation decision ran first', async () => {
    const { service, revokePendingByOrganization } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.revokeInvite({ organizationId: ORG_ID, inviteId: 'invite-1' }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(revokePendingByOrganization).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared clinic_team for this continuation', async () => {
    const { service, createReplacingPending } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('clinic_team');
      const result = await service.createInvite({
        organizationId: ORG_ID,
        email: 'staff@example.test',
        role: 'doctor',
        createdByPlatformUserId: 'owner-1',
      });
      expect(result.ok).toBe(true);
      expect(result.token).toEqual(expect.any(String));
    });
    expect(createReplacingPending).toHaveBeenCalledOnce();
  });
});
