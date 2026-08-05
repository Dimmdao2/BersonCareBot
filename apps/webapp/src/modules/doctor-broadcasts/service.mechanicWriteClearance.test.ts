import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createDoctorBroadcastsService } from './service';
import type { BroadcastAuditPort, DoctorBroadcastDeliveryCommitPort } from './ports';

function buildService() {
  const commitAuditAndDeliveryQueue = vi.fn(async () => ({
    id: 'audit-1',
    actorId: 'doctor-1',
    category: 'service' as const,
    audienceFilter: 'all' as const,
    messageTitle: 'Title',
    messageBody: 'Body',
    channels: ['bot_message'] as const,
    previewOnly: false,
    audienceSize: 0,
    deliveryJobsTotal: 0,
    attachMenuAfterSend: false,
    sentCount: 0,
    errorCount: 0,
    blockedRecipientCount: 0,
    createdAt: new Date().toISOString(),
  }));
  const broadcastAuditPort = {
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
    }),
    broadcastAuditPort,
    doctorBroadcastDeliveryCommitPort,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, commitAuditAndDeliveryQueue };
}

const command = {
  category: 'service' as const,
  audienceFilter: 'all' as const,
  message: { title: 'Title', body: 'Body' },
  actorId: 'doctor-1',
  channels: ['bot_message'] as const,
};

describe('doctor-broadcasts service — 3.2 physical door (mailings)', () => {
  it('refuses execute when no mailings mutation decision ran first', async () => {
    const { service, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(service.execute(command, { organizationId: 'org-1' })).rejects.toBeInstanceOf(
        MechanicWriteClearanceRequiredError,
      );
    });
    expect(commitAuditAndDeliveryQueue).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared mailings for this continuation', async () => {
    const { service, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('mailings');
      const result = await service.execute(command, { organizationId: 'org-1' });
      expect(result.auditEntry.id).toBe('audit-1');
    });
    expect(commitAuditAndDeliveryQueue).toHaveBeenCalledOnce();
  });
});
