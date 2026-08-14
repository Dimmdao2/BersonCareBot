import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createDoctorBroadcastsService } from './service';
import type { BroadcastAuditEntry, BroadcastAuditPort, BroadcastCommand, DoctorBroadcastDeliveryCommitPort } from './ports';

function buildService() {
  const commitAuditAndDeliveryQueue = vi.fn(async (): Promise<BroadcastAuditEntry> => ({
    id: 'audit-1',
    organizationId: '11111111-1111-4111-8111-111111111111',
    actorId: 'doctor-1',
    category: 'service',
    audienceFilter: 'all',
    messageTitle: 'Title',
    messageBody: 'Body',
    channels: ['bot_message'],
    previewOnly: false,
    audienceSize: 0,
    deliveryJobsTotal: 0,
    attachMenuAfterSend: false,
    sentCount: 0,
    errorCount: 0,
    blockedRecipientCount: 0,
    executedAt: new Date().toISOString(),
  }));
  const broadcastAuditPort = {
    append: vi.fn(async (entry) => ({ id: 'audit-1', executedAt: new Date().toISOString(), ...entry })),
    list: vi.fn(async () => []),
  } satisfies BroadcastAuditPort;
  const doctorBroadcastDeliveryCommitPort = {
    commitAuditAndDeliveryQueue,
  } satisfies DoctorBroadcastDeliveryCommitPort;
  const service = createDoctorBroadcastsService({
    resolveBroadcastAudience: async () => ({
      audienceSize: 0,
      recipientsPreview: { names: [], total: 0, truncated: false },
      effectiveClients: [],
      eligibleClients: [],
      audienceFilter: 'all',
      notificationPrefsByUserId: new Map(),
      deliveryPolicyKind: 'none',
      deliveryPolicyDescriptionRu: '—',
      webPushEligibleUserIds: new Set<string>(),
    }),
    broadcastAuditPort,
    doctorBroadcastDeliveryCommitPort,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, commitAuditAndDeliveryQueue };
}

const command: BroadcastCommand = {
  category: 'service',
  audienceFilter: 'all',
  message: { title: 'Title', body: 'Body' },
  actorId: 'doctor-1',
  channels: ['telegram'],
};

const executionOptions = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  visibilityActor: {
    membershipRole: 'doctor' as const,
    specialistId: '33333333-3333-4333-8333-333333333333',
    canManageAllSpecialists: false,
  },
};

describe('doctor-broadcasts service — 3.2 physical door (mailings)', () => {
  it('refuses execute when no mailings mutation decision ran first', async () => {
    const { service, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(service.execute(command, executionOptions)).rejects.toBeInstanceOf(
        MechanicWriteClearanceRequiredError,
      );
    });
    expect(commitAuditAndDeliveryQueue).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared mailings for this continuation', async () => {
    const { service, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('mailings');
      const result = await service.execute(command, executionOptions);
      expect(result.auditEntry.id).toBe('audit-1');
    });
    expect(commitAuditAndDeliveryQueue).toHaveBeenCalledOnce();
  });
});
