import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { MergeConflictError } from '@/infra/repos/platformUserMergeErrors';
import { handleIntegratorEvent, type IntegratorEventsDeps } from './events';
import { inMemoryReminderProjectionPort } from '@/infra/repos/inMemoryReminderProjection';
import { inMemorySupportCommunicationPort } from '@/infra/repos/inMemorySupportCommunication';
import { inMemorySubscriptionMailingProjectionPort } from '@/infra/repos/inMemorySubscriptionMailingProjection';

const mockDeps: IntegratorEventsDeps = {
  diaries: {
    createSymptomTracking: async () => ({}),
    createLfkComplex: async () => ({}),
    addLfkSession: async () => ({}),
    addSymptomEntry: async () => ({}),
  },
};

describe('handleIntegratorEvent', () => {
  it('accepts diary.symptom.tracking.created with valid payload', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: { userId: 'usr-1', symptomTitle: 'Головная боль' },
      },
      { diaries: deps.diaries },
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects diary.symptom.tracking.created without userId', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: { symptomTitle: 'X' },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('userId');
  });

  it('rejects diary.symptom.tracking.created without symptomTitle', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: { userId: 'usr-1' },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('symptomTitle');
  });

  it('accepts diary.symptom.entry.created with valid payload after creating tracking', async () => {
    const deps = buildAppDeps();
    const trackingResult = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: { userId: 'usr-entry-1', symptomTitle: 'Спина' },
      },
      { diaries: deps.diaries },
    );
    expect(trackingResult.accepted).toBe(true);

    const trackings = await deps.diaries.listSymptomTrackings('usr-entry-1');
    expect(trackings.length).toBeGreaterThanOrEqual(1);
    const trackingId = trackings[0].id;

    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.entry.created',
        payload: {
          userId: 'usr-entry-1',
          trackingId,
          value0_10: 7,
          entryType: 'instant',
          recordedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries },
    );
    expect(result.accepted).toBe(true);

    const entries = await deps.diaries.listSymptomEntries('usr-entry-1');
    expect(entries.some((e) => e.value0_10 === 7 && e.trackingId === trackingId)).toBe(true);
  });

  it('rejects diary.symptom.entry.created without trackingId', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.entry.created',
        payload: {
          userId: 'u',
          value0_10: 5,
          entryType: 'instant',
          recordedAt: new Date().toISOString(),
        },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('trackingId');
  });

  it('rejects diary.symptom.entry.created with value0_10 out of range', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.entry.created',
        payload: {
          userId: 'u',
          trackingId: 'tr-any',
          value0_10: 11,
          entryType: 'instant',
          recordedAt: new Date().toISOString(),
        },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('value0_10');
  });

  it('accepts diary.lfk.complex.created with valid payload', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.lfk.complex.created',
        payload: { userId: 'usr-lfk-1', title: 'Разминка для шеи' },
      },
      { diaries: deps.diaries },
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts diary.lfk.session.created after creating complex', async () => {
    const deps = buildAppDeps();
    const complexResult = await handleIntegratorEvent(
      {
        eventType: 'diary.lfk.complex.created',
        payload: { userId: 'usr-lfk-2', title: 'Спина' },
      },
      { diaries: deps.diaries },
    );
    expect(complexResult.accepted).toBe(true);
    const complexes = await deps.diaries.listLfkComplexes('usr-lfk-2');
    expect(complexes.length).toBeGreaterThanOrEqual(1);
    const complexId = complexes[0].id;
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.lfk.session.created',
        payload: {
          userId: 'usr-lfk-2',
          complexId,
          completedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries },
    );
    expect(result.accepted).toBe(true);
  });

  it('returns not implemented for unknown event type', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'unknown.event',
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('not implemented');
  });

  it('accepts user.upserted with string integratorUserId', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: { integratorUserId: '12345678901234' },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts user.upserted with number integratorUserId (backward compat)', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: { integratorUserId: 999 },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects user.upserted without integratorUserId', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: {},
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorUserId');
  });

  it('contact.linked creates skeleton user if user.upserted not received yet', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: { integratorUserId: '77777', phoneNormalized: '+70001112233' },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(true);
  });

  it('passes channel binding fields from contact.linked to projection upsert', async () => {
    const users = {
      upsertFromProjection: vi.fn().mockResolvedValue({ platformUserId: 'platform-1' }),
      findByIntegratorId: vi.fn().mockResolvedValue(null),
      updatePhone: vi.fn().mockResolvedValue(undefined),
      updateProfileByPhone: vi.fn(),
    };
    const result = await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: {
          integratorUserId: '77777',
          phoneNormalized: '+70001112233',
          channelCode: 'telegram',
          externalId: 'tg77777',
        },
      },
      { ...mockDeps, users },
    );

    expect(result.accepted).toBe(true);
    expect(users.upsertFromProjection).toHaveBeenCalledWith({
      integratorUserId: '77777',
      phoneNormalized: '+70001112233',
      channelCode: 'telegram',
      externalId: 'tg77777',
    });
    expect(users.updatePhone).not.toHaveBeenCalled();
  });

  it('contact.linked skips upsert when integrator row already has same phone and no channel binding in payload', async () => {
    const upsertFromProjection = vi.fn();
    const findByIntegratorId = vi.fn().mockResolvedValue({
      platformUserId: 'plat-1',
      phoneNormalized: '+70001112233',
    });
    const result = await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: { integratorUserId: '77777', phoneNormalized: '+70001112233' },
      },
      {
        ...mockDeps,
        users: {
          upsertFromProjection,
          findByIntegratorId,
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(upsertFromProjection).not.toHaveBeenCalled();
  });

  it('contact.linked still upserts when channel+external present even if phone matches integrator row', async () => {
    const upsertFromProjection = vi.fn().mockResolvedValue({ platformUserId: 'plat-1' });
    const findByIntegratorId = vi.fn().mockResolvedValue({
      platformUserId: 'plat-1',
      phoneNormalized: '+70001112233',
    });
    await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: {
          integratorUserId: '77777',
          phoneNormalized: '+70001112233',
          channelCode: 'telegram',
          externalId: 'tg77777',
        },
      },
      {
        ...mockDeps,
        users: {
          upsertFromProjection,
          findByIntegratorId,
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(upsertFromProjection).toHaveBeenCalledTimes(1);
  });

  it('contact.linked postgres unique_violation is not retryable (422 path)', async () => {
    const pgErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    const upsertFromProjection = vi.fn().mockRejectedValue(pgErr);
    const result = await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: { integratorUserId: '77', phoneNormalized: '+79000000001' },
      },
      {
        ...mockDeps,
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn().mockResolvedValue(null),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('preferences.updated creates skeleton user if user.upserted not received yet', async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: 'preferences.updated',
        payload: {
          integratorUserId: '88888',
          topics: [{ topicCode: 'booking_spb', isEnabled: true }],
        },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(true);
  });

  it('user.upserted non-merge Error stays retryable (503 path), no conflict audit', async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi.fn().mockRejectedValue(new Error('connection reset'));
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: { integratorUserId: '42' },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(false);
    expect(logAutoMergeConflict).not.toHaveBeenCalled();
    expect(result.reason).toContain('connection reset');
  });

  it('user.upserted MergeConflictError → conflict audit + accepted (no 503 loop)', async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi
      .fn()
      .mockRejectedValue(
        new MergeConflictError('two users', [
          '00000000-0000-4000-8000-0000000000a1',
          '00000000-0000-4000-8000-0000000000a2',
        ]),
      );
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: { integratorUserId: '42', phoneNormalized: '+79000000000' },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(logAutoMergeConflict).toHaveBeenCalledTimes(1);
    expect(upsertFromProjection).toHaveBeenCalled();
  });

  it('contact.linked MergeConflictError → conflict audit + accepted, no updatePhone', async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi
      .fn()
      .mockRejectedValue(
        new MergeConflictError('conflict', [
          '00000000-0000-4000-8000-0000000000b1',
          '00000000-0000-4000-8000-0000000000b2',
        ]),
      );
    const updatePhone = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: { integratorUserId: '77', phoneNormalized: '+79000000001' },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone,
          updateProfileByPhone: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(updatePhone).not.toHaveBeenCalled();
  });

  it('preferences.updated MergeConflictError on upsertFromProjection → audit + accepted, no topic writes', async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi
      .fn()
      .mockRejectedValue(
        new MergeConflictError('conflict', [
          '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000c2',
        ]),
      );
    const upsertNotificationTopics = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: 'preferences.updated',
        payload: {
          integratorUserId: '88',
          topics: [{ topicCode: 'booking_spb', isEnabled: true }],
        },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
        },
        preferences: {
          upsertNotificationTopics,
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(upsertNotificationTopics).not.toHaveBeenCalled();
  });

  it('contact.linked then user.upserted produces consistent state', async () => {
    const deps = buildAppDeps();
    await handleIntegratorEvent(
      {
        eventType: 'contact.linked',
        payload: { integratorUserId: '99999', phoneNormalized: '+70009998877' },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.upserted',
        payload: {
          integratorUserId: '99999',
          displayName: 'Test User',
          channelCode: 'telegram',
          externalId: 'tg99999',
        },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection },
    );
    expect(result.accepted).toBe(true);
  });
});

describe('handleIntegratorEvent: support.* communication ingest', () => {
  const sc = inMemorySupportCommunicationPort;
  const depsWithSc: IntegratorEventsDeps = { ...mockDeps, supportCommunication: sc };

  it('accepts support.conversation.opened', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.opened',
        payload: {
          integratorConversationId: 'conv-test-1',
          integratorUserId: '42',
          source: 'telegram',
          adminScope: 'support',
          status: 'open',
          openedAt: '2025-03-01T10:00:00.000Z',
          lastMessageAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.conversation.opened without integratorConversationId', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.opened',
        payload: { openedAt: '2025-03-01T10:00:00.000Z' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorConversationId');
  });

  it('accepts support.conversation.message.appended', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.message.appended',
        payload: {
          integratorMessageId: 'msg-test-1',
          integratorConversationId: 'conv-test-1',
          senderRole: 'user',
          text: 'Hello from test',
          source: 'telegram',
          createdAt: '2025-03-01T10:01:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.conversation.message.appended without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.message.appended',
        payload: { text: 'orphan' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required fields missing');
  });

  it('accepts support.conversation.status.changed', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.status.changed',
        payload: {
          integratorConversationId: 'conv-test-1',
          status: 'closed',
          closedAt: '2025-03-01T10:02:00.000Z',
          closeReason: 'resolved',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.conversation.status.changed without status', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.status.changed',
        payload: { integratorConversationId: 'conv-test-1' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('status required');
  });

  it('accepts support.question.created', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.created',
        payload: {
          integratorQuestionId: 'q-test-1',
          integratorConversationId: 'conv-test-1',
          status: 'open',
          createdAt: '2025-03-01T10:03:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.question.created without integratorQuestionId', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.created',
        payload: { status: 'open' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorQuestionId');
  });

  it('accepts support.question.message.appended', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.message.appended',
        payload: {
          integratorQuestionMessageId: 'qm-test-1',
          integratorQuestionId: 'q-test-1',
          senderRole: 'user',
          text: 'Why?',
          createdAt: '2025-03-01T10:04:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.question.message.appended without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.message.appended',
        payload: { text: 'orphan' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required fields missing');
  });

  it('accepts support.question.answered', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.answered',
        payload: {
          integratorQuestionId: 'q-test-1',
          answeredAt: '2025-03-01T10:05:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects support.question.answered without answeredAt', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.question.answered',
        payload: { integratorQuestionId: 'q-ans-1' },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('answeredAt required');
  });

  it('accepts support.delivery.attempt.logged', async () => {
    const appendSpy = vi.spyOn(sc, 'appendDeliveryEventFromProjection');
    try {
      const result = await handleIntegratorEvent(
        {
          eventType: 'support.delivery.attempt.logged',
          payload: {
            organizationId: '10000000-0000-4000-8000-000000000001',
            intentEventId: 'evt-test-1',
            correlationId: 'corr-1',
            channelCode: 'telegram',
            status: 'success',
            attempt: 1,
            occurredAt: '2025-03-01T10:06:00.000Z',
          },
        },
        depsWithSc,
      );
      expect(result.accepted).toBe(true);
      expect(appendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: '10000000-0000-4000-8000-000000000001',
        }),
      );
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('rejects support.delivery.attempt.logged without organizationId', async () => {
    const appendSpy = vi.spyOn(sc, 'appendDeliveryEventFromProjection');
    try {
      const result = await handleIntegratorEvent(
        {
          eventType: 'support.delivery.attempt.logged',
          payload: {
            intentEventId: 'evt-test-missing-org',
            channelCode: 'web_push',
            status: 'success',
          },
        },
        depsWithSc,
      );
      expect(result).toEqual({
        accepted: false,
        reason: 'support.delivery.attempt.logged: organizationId required',
        retryable: false,
      });
      expect(appendSpy).not.toHaveBeenCalled();
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('idempotent: duplicate conversation opened returns accepted', async () => {
    const payload = {
      integratorConversationId: 'conv-idem-1',
      integratorUserId: '50',
      source: 'telegram',
      adminScope: 'support',
      status: 'open',
      openedAt: '2025-03-01T10:00:00.000Z',
      lastMessageAt: '2025-03-01T10:00:00.000Z',
    };
    const r1 = await handleIntegratorEvent(
      { eventType: 'support.conversation.opened', payload },
      depsWithSc,
    );
    const r2 = await handleIntegratorEvent(
      { eventType: 'support.conversation.opened', payload },
      depsWithSc,
    );
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });

  it('out-of-order: message before conversation creates skeleton', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.message.appended',
        payload: {
          integratorMessageId: 'msg-ooo-1',
          integratorConversationId: 'conv-ooo-1',
          senderRole: 'user',
          text: 'First message, no conversation yet',
          source: 'telegram',
          createdAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithSc,
    );
    expect(result.accepted).toBe(true);
  });

  it('falls through to not-implemented when supportCommunication dep missing', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'support.conversation.opened',
        payload: { integratorConversationId: 'c', openedAt: '2025-01-01T00:00:00Z' },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('not implemented');
  });
});

describe('handleIntegratorEvent: Stage 7 reminder/content projection ingest', () => {
  const rp = inMemoryReminderProjectionPort;
  const depsWithRp: IntegratorEventsDeps = { ...mockDeps, reminderProjection: rp };

  it('accepts reminder.rule.upserted', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.rule.upserted',
        payload: {
          integratorRuleId: 'rule-s7-1',
          integratorUserId: '42',
          category: 'exercise',
          isEnabled: true,
          scheduleType: 'daily',
          timezone: 'Europe/Moscow',
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: '1111111',
          contentMode: 'none',
          updatedAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts reminder.rule.upserted with interval fields as numeric strings (JSON coercion)', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.rule.upserted',
        payload: {
          integratorRuleId: 'rule-s7-str',
          integratorUserId: '42',
          category: 'water',
          isEnabled: false,
          scheduleType: 'daily',
          timezone: 'UTC',
          intervalMinutes: '120',
          windowStartMinute: '0',
          windowEndMinute: '1440',
          daysMask: '1111111',
          contentMode: 'none',
          updatedAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
    const rule = await rp.getRuleByIntegratorUserIdAndCategory('42', 'water');
    expect(rule?.intervalMinutes).toBe(120);
  });

  it('rejects reminder.rule.upserted without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.rule.upserted',
        payload: { integratorRuleId: 'r1', category: 'exercise' },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required payload fields missing');
  });

  it('accepts reminder.occurrence.finalized (sent)', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.occurrence.finalized',
        payload: {
          integratorOccurrenceId: 'occ-s7-1',
          integratorRuleId: 'rule-s7-1',
          integratorUserId: '42',
          category: 'exercise',
          status: 'sent',
          deliveryChannel: 'telegram',
          errorCode: null,
          occurredAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts reminder.occurrence.finalized (failed)', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.occurrence.finalized',
        payload: {
          integratorOccurrenceId: 'occ-s7-2',
          integratorRuleId: 'rule-s7-1',
          integratorUserId: '42',
          category: 'exercise',
          status: 'failed',
          deliveryChannel: 'telegram',
          errorCode: 'timeout',
          occurredAt: '2025-03-01T10:01:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects reminder.occurrence.finalized without status', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.occurrence.finalized',
        payload: {
          integratorOccurrenceId: 'occ-1',
          integratorRuleId: 'rule-1',
          integratorUserId: '42',
          category: 'exercise',
          occurredAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required payload fields missing');
  });

  it('accepts reminder.delivery.logged', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.delivery.logged',
        payload: {
          integratorDeliveryLogId: 'log-s7-1',
          integratorOccurrenceId: 'occ-s7-1',
          integratorRuleId: 'rule-s7-1',
          integratorUserId: '42',
          channel: 'telegram',
          status: 'success',
          errorCode: null,
          payloadJson: {},
          createdAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
  });

  it('calls appendDeliveryEventFromProjection with payload when reminder.delivery.logged', async () => {
    const appendSpy = vi.spyOn(rp, 'appendDeliveryEventFromProjection').mockResolvedValue();
    try {
      const payload = {
        integratorDeliveryLogId: 'log-del-1',
        integratorOccurrenceId: 'occ-del-1',
        integratorRuleId: 'rule-del-1',
        integratorUserId: '99',
        channel: 'telegram',
        status: 'failed',
        errorCode: 'ERR_RATE_LIMIT',
        payloadJson: { attempt: 1 },
        createdAt: '2025-03-02T14:00:00.000Z',
      };
      const result = await handleIntegratorEvent(
        { eventType: 'reminder.delivery.logged', payload },
        depsWithRp,
      );
      expect(result.accepted).toBe(true);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledWith({
        integratorDeliveryLogId: 'log-del-1',
        integratorOccurrenceId: 'occ-del-1',
        integratorRuleId: 'rule-del-1',
        integratorUserId: '99',
        channel: 'telegram',
        status: 'failed',
        errorCode: 'ERR_RATE_LIMIT',
        payloadJson: { attempt: 1 },
        createdAt: '2025-03-02T14:00:00.000Z',
      });
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('rejects reminder.delivery.logged without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.delivery.logged',
        payload: { integratorDeliveryLogId: 'log-1' },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required payload fields missing');
  });

  it('accepts content.access.granted', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'content.access.granted',
        payload: {
          integratorGrantId: 'grant-s7-1',
          integratorUserId: '42',
          contentId: 'content-1',
          purpose: 'view',
          tokenHash: 'abc',
          expiresAt: '2026-01-01T00:00:00.000Z',
          revokedAt: null,
          metaJson: {},
          createdAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects content.access.granted without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'content.access.granted',
        payload: { integratorGrantId: 'g1' },
      },
      depsWithRp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('required payload fields missing');
  });

  it('calls upsertContentAccessGrantFromProjection with payload when content.access.granted', async () => {
    const mockRp = {
      upsertRuleFromProjection: vi.fn(),
      appendFinalizedOccurrenceFromProjection: vi.fn(),
      appendDeliveryEventFromProjection: vi.fn(),
      upsertContentAccessGrantFromProjection: vi.fn().mockResolvedValue(undefined),
      listRulesByIntegratorUserId: vi.fn().mockResolvedValue([]),
      getRuleByIntegratorUserIdAndCategory: vi.fn().mockResolvedValue(null),
      listHistoryByIntegratorUserId: vi.fn().mockResolvedValue([]),
      getUnseenCount: vi.fn().mockResolvedValue(0),
      getStats: vi.fn().mockResolvedValue({ total: 0, seen: 0, unseen: 0, failed: 0 }),
      markSeen: vi.fn().mockResolvedValue(undefined),
      markAllSeen: vi.fn().mockResolvedValue(undefined),
    };
    const depsContent: IntegratorEventsDeps = { ...mockDeps, reminderProjection: mockRp };
    const payload = {
      integratorGrantId: 'grant-spy-1',
      integratorUserId: '43',
      contentId: 'content-spy',
      purpose: 'view',
      tokenHash: 'thash',
      expiresAt: '2026-06-01T00:00:00.000Z',
      revokedAt: null as string | null,
      metaJson: { key: 'value' },
      createdAt: '2025-04-01T12:00:00.000Z',
    };
    const result = await handleIntegratorEvent(
      { eventType: 'content.access.granted', payload },
      depsContent,
    );
    expect(result.accepted).toBe(true);
    expect(mockRp.upsertContentAccessGrantFromProjection).toHaveBeenCalledTimes(1);
    expect(mockRp.upsertContentAccessGrantFromProjection).toHaveBeenCalledWith({
      integratorGrantId: 'grant-spy-1',
      integratorUserId: '43',
      contentId: 'content-spy',
      purpose: 'view',
      tokenHash: 'thash',
      expiresAt: '2026-06-01T00:00:00.000Z',
      revokedAt: null,
      metaJson: { key: 'value' },
      createdAt: '2025-04-01T12:00:00.000Z',
    });
  });

  it('idempotent: duplicate reminder.rule.upserted returns accepted', async () => {
    const payload = {
      integratorRuleId: 'rule-idem-1',
      integratorUserId: '43',
      category: 'water',
      isEnabled: false,
      scheduleType: 'twice_daily',
      timezone: 'UTC',
      intervalMinutes: 120,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '1111111',
      contentMode: 'none',
      updatedAt: '2025-03-01T10:00:00.000Z',
    };
    const r1 = await handleIntegratorEvent(
      { eventType: 'reminder.rule.upserted', payload },
      depsWithRp,
    );
    const r2 = await handleIntegratorEvent(
      { eventType: 'reminder.rule.upserted', payload },
      depsWithRp,
    );
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });

  it('falls through to not-implemented when reminderProjection dep missing', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.rule.upserted',
        payload: {
          integratorRuleId: 'r1',
          integratorUserId: '42',
          category: 'exercise',
          isEnabled: true,
          scheduleType: 'daily',
          timezone: 'UTC',
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: '1111111',
          contentMode: 'none',
          updatedAt: new Date().toISOString(),
        },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('not implemented');
  });
});

describe('handleIntegratorEvent: Stage 11 subscription/mailing projection ingest', () => {
  const smp = inMemorySubscriptionMailingProjectionPort;
  const depsWithSmp: IntegratorEventsDeps = { ...mockDeps, subscriptionMailingProjection: smp };

  it('accepts mailing.topic.upserted', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'mailing.topic.upserted',
        payload: {
          integratorTopicId: 100,
          code: 'news',
          title: 'News',
          key: 'news',
          isActive: true,
          updatedAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects mailing.topic.upserted without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'mailing.topic.upserted',
        payload: { integratorTopicId: 100, code: 'news' },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorTopicId, code, title, key required');
  });

  it('calls upsertTopicFromProjection with payload when mailing.topic.upserted', async () => {
    const upsertSpy = vi.spyOn(smp, 'upsertTopicFromProjection').mockResolvedValue();
    try {
      const payload = {
        integratorTopicId: 101,
        code: 'alerts',
        title: 'Alerts',
        key: 'alerts',
        isActive: false,
        updatedAt: '2025-03-02T12:00:00.000Z',
      };
      const result = await handleIntegratorEvent(
        { eventType: 'mailing.topic.upserted', payload },
        depsWithSmp,
      );
      expect(result.accepted).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        integratorTopicId: 101,
        code: 'alerts',
        title: 'Alerts',
        key: 'alerts',
        isActive: false,
        updatedAt: '2025-03-02T12:00:00.000Z',
      });
    } finally {
      upsertSpy.mockRestore();
    }
  });

  it('accepts user.subscription.upserted', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.subscription.upserted',
        payload: {
          integratorUserId: 1,
          integratorTopicId: 100,
          isActive: true,
          updatedAt: '2025-03-01T10:00:00.000Z',
        },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects user.subscription.upserted without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'user.subscription.upserted',
        payload: { integratorUserId: 1 },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorUserId, integratorTopicId required');
  });

  it('calls upsertUserSubscriptionFromProjection with payload when user.subscription.upserted', async () => {
    const upsertSpy = vi.spyOn(smp, 'upsertUserSubscriptionFromProjection').mockResolvedValue();
    try {
      const payload = {
        integratorUserId: 2,
        integratorTopicId: 100,
        isActive: false,
        updatedAt: '2025-03-02T14:00:00.000Z',
      };
      const result = await handleIntegratorEvent(
        { eventType: 'user.subscription.upserted', payload },
        depsWithSmp,
      );
      expect(result.accepted).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        integratorUserId: 2,
        integratorTopicId: 100,
        isActive: false,
        updatedAt: '2025-03-02T14:00:00.000Z',
      });
    } finally {
      upsertSpy.mockRestore();
    }
  });

  it('accepts mailing.log.sent', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'mailing.log.sent',
        payload: {
          integratorUserId: 1,
          integratorMailingId: 200,
          status: 'sent',
          sentAt: '2025-03-01T12:00:00.000Z',
          errorText: null,
        },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(true);
  });

  it('rejects mailing.log.sent without required fields', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'mailing.log.sent',
        payload: { integratorUserId: 1, integratorMailingId: 200 },
      },
      depsWithSmp,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('integratorUserId, integratorMailingId, status required');
  });

  it('calls appendMailingLogFromProjection with payload when mailing.log.sent', async () => {
    const appendSpy = vi.spyOn(smp, 'appendMailingLogFromProjection').mockResolvedValue();
    try {
      const payload = {
        integratorUserId: 3,
        integratorMailingId: 201,
        status: 'failed',
        sentAt: '2025-03-02T15:00:00.000Z',
        errorText: 'timeout',
      };
      const result = await handleIntegratorEvent(
        { eventType: 'mailing.log.sent', payload },
        depsWithSmp,
      );
      expect(result.accepted).toBe(true);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledWith({
        integratorUserId: 3,
        integratorMailingId: 201,
        status: 'failed',
        sentAt: '2025-03-02T15:00:00.000Z',
        errorText: 'timeout',
      });
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('falls through to not-implemented when subscriptionMailingProjection dep missing', async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: 'mailing.topic.upserted',
        payload: {
          integratorTopicId: 100,
          code: 'news',
          title: 'News',
          key: 'news',
          isActive: true,
          updatedAt: '2025-03-01T10:00:00.000Z',
        },
      },
      mockDeps,
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('not implemented');
  });
});
