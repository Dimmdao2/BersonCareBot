import { describe, expect, it, vi } from 'vitest';
import {
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createDoctorBroadcastsService } from './service';
import type {
  BroadcastAuditEntry,
  BroadcastAuditPort,
  BroadcastCommand,
  DoctorBroadcastDeliveryCommitPort,
} from './ports';

/**
 * TPB-15: платформенного запасного имени темы письма больше нет — пустой заголовок
 * обязан отбиваться на входе execute, а не превращаться в 400 из relay после
 * отбора аудитории (находка закрывающего аудита круга 2).
 */
function buildService() {
  const commitAuditAndDeliveryQueue = vi.fn(
    async (): Promise<BroadcastAuditEntry> => ({
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
    }),
  );
  const broadcastAuditPort = {
    append: vi.fn(async (entry) => ({ id: 'audit-1', executedAt: new Date().toISOString(), ...entry })),
    list: vi.fn(async () => []),
  } satisfies BroadcastAuditPort;
  const doctorBroadcastDeliveryCommitPort = {
    commitAuditAndDeliveryQueue,
  } satisfies DoctorBroadcastDeliveryCommitPort;
  const resolveBroadcastAudience = vi.fn(async () => ({
    audienceSize: 0,
    recipientsPreview: { names: [], total: 0, truncated: false },
    effectiveClients: [],
    eligibleClients: [],
    audienceFilter: 'all' as const,
    notificationPrefsByUserId: new Map(),
    deliveryPolicyKind: 'none' as const,
    deliveryPolicyDescriptionRu: '—',
    webPushEligibleUserIds: new Set<string>(),
  }));
  const service = createDoctorBroadcastsService({
    getTopicDisplayTitle: async (topicCode: string) => `тема ${topicCode}`,
    resolveBroadcastAudience,
    broadcastAuditPort,
    doctorBroadcastDeliveryCommitPort,
    broadcastEmailRecipientsPort: {
      getVerifiedEmailsForUserIds: async () => new Map(),
    },
    patientNotificationTopics: {
      listByUserId: async () => [],
      listByUserIds: async () => new Map(),
      setTopicEnabled: async () => {},
    },
    buildTopicUnsubscribeUrl: () => 'https://example.test/unsubscribe',
  });
  return { service, commitAuditAndDeliveryQueue, resolveBroadcastAudience };
}

const executionOptions = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  visibilityActor: {
    membershipRole: 'doctor' as const,
    specialistId: '33333333-3333-4333-8333-333333333333',
    canManageAllSpecialists: false,
  },
};

function commandWithTitle(title: string): BroadcastCommand {
  return {
    category: 'service',
    audienceFilter: 'all',
    message: { title, body: 'Body' },
    actorId: 'doctor-1',
    channels: ['email'],
  };
}

describe('doctor-broadcasts service — заголовок обязателен', () => {
  it.each([
    ['пустая строка', ''],
    ['только пробелы', '   '],
  ])('отказывает до отбора аудитории: %s', async (_name, title) => {
    const { service, resolveBroadcastAudience, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('mailings');
      await expect(service.execute(commandWithTitle(title), executionOptions)).rejects.toThrow(
        'broadcast_title_required',
      );
    });
    expect(resolveBroadcastAudience).not.toHaveBeenCalled();
    expect(commitAuditAndDeliveryQueue).not.toHaveBeenCalled();
  });

  it('непустой заголовок проходит', async () => {
    const { service, commitAuditAndDeliveryQueue } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('mailings');
      const result = await service.execute(commandWithTitle('Тема письма'), executionOptions);
      expect(result.auditEntry.id).toBe('audit-1');
    });
    expect(commitAuditAndDeliveryQueue).toHaveBeenCalledOnce();
  });
});
