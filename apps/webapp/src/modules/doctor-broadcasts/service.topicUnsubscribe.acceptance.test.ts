import { describe, expect, it, vi } from 'vitest';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { createDoctorBroadcastsService } from './service';
import type {
  BroadcastCommand,
  DoctorBroadcastQueueJob,
} from './ports';
import type {
  FanOutBroadcastEmailInput,
  FanOutBroadcastEmailResult,
} from './fanOutBroadcastEmail';
import { buildBroadcastEmailHtml } from './fanOutBroadcastEmail';

const SUBSCRIBED_USER_ID = '11111111-1111-4111-8111-111111111111';
const UNSUBSCRIBED_USER_ID = '22222222-2222-4222-8222-222222222222';

function client(userId: string, displayName: string): ClientListItem {
  return {
    userId,
    displayName,
    phone: '+79991234567',
    bindings: { telegramId: userId === SUBSCRIBED_USER_ID ? '12345' : '67890' },
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationsCount: 0,
    reschedulesCount: 0,
  };
}

describe('doctor broadcast topic unsubscribe — send-time gate', () => {
  it('keeps an unsubscribed recipient out of bot/email and adds the same topic CTA to deliveries', async () => {
    const clients = [client(SUBSCRIBED_USER_ID, 'Подписан'), client(UNSUBSCRIBED_USER_ID, 'Отписан')];
    let committedJobs: readonly DoctorBroadcastQueueJob[] = [];
    const capturedEmail = { input: null as FanOutBroadcastEmailInput | null };
    const fanOutBroadcastEmail = vi.fn(
      async (input: FanOutBroadcastEmailInput): Promise<FanOutBroadcastEmailResult> => {
        capturedEmail.input = input;
        return { attempted: 1, delivered: 1, errors: 0, skipped: 0 };
      },
    );
    const service = createDoctorBroadcastsService({
      resolveBroadcastAudience: async () => ({
        audienceSize: clients.length,
        recipientsPreview: { names: clients.map((row) => row.displayName), total: 2, truncated: false },
        effectiveClients: clients,
        eligibleClients: clients,
        audienceFilter: 'all',
        notificationPrefsByUserId: new Map(),
        deliveryPolicyKind: 'respect_prefs_bot',
        deliveryPolicyDescriptionRu: 'Тест',
        webPushEligibleUserIds: new Set<string>(),
        emailEligibleUserIds: new Set([SUBSCRIBED_USER_ID, UNSUBSCRIBED_USER_ID]),
      }),
      patientNotificationTopics: {
        listByUserId: async () => [],
        listByUserIds: async () =>
          new Map([
            [
              UNSUBSCRIBED_USER_ID,
              [{ topicCode: 'patient_news', isEnabled: false }],
            ],
          ]),
        setTopicEnabled: async () => {},
      },
      buildTopicUnsubscribeUrl: ({ userId, topicCode, nonce }) =>
        `https://example.test/unsubscribe/${userId}/${topicCode}/${nonce}`,
      broadcastAuditPort: {
        append: async (entry) => ({ ...entry, id: 'unused', executedAt: new Date().toISOString() }),
        list: async () => [],
      },
      doctorBroadcastDeliveryCommitPort: {
        commitAuditAndDeliveryQueue: async ({ auditId, audit, jobs }) => {
          committedJobs = jobs;
          return { ...audit, id: auditId, executedAt: new Date().toISOString() };
        },
      },
      fanOutBroadcastEmail,
      fanOutBroadcastEmailDeps: {
        emailRecipientsPort: { getVerifiedEmailsForUserIds: async () => new Map() },
      },
    });
    const command: BroadcastCommand = {
      category: 'marketing',
      audienceFilter: 'all',
      actorId: 'doctor-1',
      channels: ['telegram', 'email'],
      message: { title: 'Новость', body: 'Текст' },
    };
    const context = {
      organizationId: '33333333-3333-4333-8333-333333333333',
      visibilityActor: {
        membershipRole: 'doctor' as const,
        specialistId: '44444444-4444-4444-8444-444444444444',
        canManageAllSpecialists: false,
      },
    };

    const preview = await service.preview(command, context);
    expect(preview.audienceSize).toBe(1);
    expect(preview.recipientsPreview?.names).toEqual(['Подписан']);

    const result = await service.execute(command, context);
    expect(result.auditEntry.audienceSize).toBe(1);
    expect(committedJobs).toHaveLength(1);
    const intent = committedJobs[0]?.payloadJson.intent as {
      payload?: { replyMarkup?: { inline_keyboard?: Array<Array<{ text?: string; url?: string }>> } };
    };
    const button = intent.payload?.replyMarkup?.inline_keyboard?.[0]?.[0];
    expect(button?.text).toBe('Отписаться от темы');
    expect(button?.url).toContain(`/${SUBSCRIBED_USER_ID}/patient_news/`);
    expect(button?.url).not.toContain(UNSUBSCRIBED_USER_ID);

    expect(fanOutBroadcastEmail).toHaveBeenCalledOnce();
    expect(capturedEmail.input?.eligibleClients.map((row) => row.userId)).toEqual([
      SUBSCRIBED_USER_ID,
    ]);
    expect(capturedEmail.input?.unsubscribeUrlByUserId.get(SUBSCRIBED_USER_ID)).toContain(
      '/patient_news/',
    );
    expect(
      buildBroadcastEmailHtml({
        title: command.message.title,
        body: command.message.body,
        unsubscribeUrl: capturedEmail.input?.unsubscribeUrlByUserId.get(SUBSCRIBED_USER_ID) ?? '',
      }),
    ).toContain('>Отписаться от темы</a>');
  });
});
