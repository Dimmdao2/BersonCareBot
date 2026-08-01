import { describe, expect, it, vi } from 'vitest';
import { createIntegratorSupportBridge } from '@/modules/messaging/integratorSupportBridge';
import type { IntegratorSupportOwnershipPort } from '@/modules/messaging/ports';
import type { IntegratorSupportQuestionOwnershipPort } from '@/modules/messaging/ports';

describe('integrator support ownership bridge', () => {
  it('opens the organization conversation, records the complete message, and asks integrator delivery once', async () => {
    const ensure = vi.fn().mockResolvedValue({ id: 'conversation-db-id' });
    const append = vi
      .fn()
      .mockResolvedValueOnce({ id: 'message-db-id', created: true })
      .mockResolvedValueOnce({ id: 'message-db-id', created: false });
    const notify = vi.fn().mockResolvedValue(undefined);
    const setStatus = vi.fn().mockResolvedValue(undefined);
    const principalCalls: string[] = [];
    const principal = async <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => {
      principalCalls.push(organizationId);
      return fn();
    };
    const port: IntegratorSupportOwnershipPort = {
      ensureWebappConversationForUser: ensure,
      appendWebappMessage: append,
      setConversationStatusFromProjection: setStatus,
    };
    const questionPort: IntegratorSupportQuestionOwnershipPort = {
      createQuestion: vi.fn(),
      appendQuestionMessage: vi.fn(),
      markQuestionAnswered: vi.fn(),
      recordDeliveryAttempt: vi.fn(),
    };
    const bridge = createIntegratorSupportBridge({
      port,
      questionPort,
      resolvePatientOrganization: vi.fn().mockResolvedValue({
        ok: true,
        organizationId: '11111111-1111-4111-8111-111111111111',
      }),
      withOrganizationPrincipal: principal,
      notifyDoctorOfPatientMessage: notify,
      resolvePatientLabel: vi.fn().mockResolvedValue('Пациент'),
    });
    const input = {
      platformUserId: '22222222-2222-4222-8222-222222222222',
      integratorMessageId: 'integrator-message-1',
      text: ' Нужна помощь ',
      source: 'telegram',
      createdAt: '2026-07-31T09:00:00.000Z',
      externalChatId: 'chat-7',
      externalMessageId: 'message-9',
    };

    const first = await bridge.syncUserMessage(input);
    const replay = await bridge.syncUserMessage(input);
    const closed = await bridge.setStatus({
      integratorConversationId: 'webapp:platform:22222222-2222-4222-8222-222222222222',
      status: 'closed',
      lastMessageAt: '2026-07-31T09:05:00.000Z',
      closedAt: '2026-07-31T09:05:00.000Z',
      closeReason: 'admin_closed',
    });

    expect(first).toEqual({
      ok: true,
      canonicalWrite: {
        conversationId: 'webapp:platform:22222222-2222-4222-8222-222222222222',
        organizationId: '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(replay).toEqual(first);
    expect(closed).toEqual(first);
    expect(principalCalls).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(append).toHaveBeenNthCalledWith(1, {
      conversationId: 'conversation-db-id',
      integratorMessageId: 'integrator-message-1',
      senderRole: 'user',
      text: 'Нужна помощь',
      source: 'telegram',
      createdAt: '2026-07-31T09:00:00.000Z',
      organizationId: '11111111-1111-4111-8111-111111111111',
      externalChatId: 'chat-7',
      externalMessageId: 'message-9',
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '11111111-1111-4111-8111-111111111111',
        conversationId: 'conversation-db-id',
        messageId: 'integrator-message-1',
        messageText: 'Нужна помощь',
      }),
    );
    expect(setStatus).toHaveBeenCalledWith({
      integratorConversationId:
        'webapp:organization:11111111-1111-4111-8111-111111111111:platform:22222222-2222-4222-8222-222222222222',
      status: 'closed',
      lastMessageAt: '2026-07-31T09:05:00.000Z',
      closedAt: '2026-07-31T09:05:00.000Z',
      closeReason: 'admin_closed',
    });
  });

  it('creates, appends idempotently, and answers a question under the resolved organization', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({ id: 'conversation-db-id' });
    const createQuestion = vi.fn().mockResolvedValue({ id: 'question-db-id' });
    const appendQuestionMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: 'message-db-id', created: true })
      .mockResolvedValueOnce({ id: 'message-db-id', created: false });
    const markQuestionAnswered = vi.fn().mockResolvedValue(undefined);
    const bridge = createIntegratorSupportBridge({
      port: {
        ensureWebappConversationForUser,
        appendWebappMessage: vi.fn(),
        setConversationStatusFromProjection: vi.fn(),
      },
      questionPort: {
        createQuestion,
        appendQuestionMessage,
        markQuestionAnswered,
        recordDeliveryAttempt: vi.fn(),
      },
      resolvePatientOrganization: vi.fn().mockResolvedValue({ ok: true, organizationId }),
      withOrganizationPrincipal: async (_organizationId, fn) => fn(),
    });
    const base = {
      integratorConversationId: 'webapp:platform:22222222-2222-4222-8222-222222222222',
      integratorQuestionId: 'question-1',
      organizationId,
    } as const;

    const created = await bridge.syncQuestionWrite({
      ...base,
      operation: 'create',
      status: 'open',
      createdAt: '2026-07-31T09:00:00.000Z',
    });
    const message = {
      ...base,
      operation: 'message' as const,
      integratorQuestionMessageId: 'question-message-1',
      senderRole: 'user' as const,
      text: 'Нужна помощь',
      createdAt: '2026-07-31T09:00:00.000Z',
    };
    const firstMessage = await bridge.syncQuestionWrite(message);
    const replay = await bridge.syncQuestionWrite(message);
    const answered = await bridge.syncQuestionWrite({
      ...base,
      operation: 'answered',
      answeredAt: '2026-07-31T09:05:00.000Z',
    });

    expect(created).toEqual({
      ok: true,
      canonicalWrite: { questionId: 'question-1', organizationId },
    });
    expect(firstMessage).toEqual({
      ok: true,
      canonicalWrite: {
        questionId: 'question-1',
        questionMessageId: 'question-message-1',
        organizationId,
      },
    });
    expect(replay).toEqual(firstMessage);
    expect(answered).toEqual(created);
    expect(createQuestion).toHaveBeenCalledWith({
      integratorQuestionId: 'question-1',
      conversationId: 'conversation-db-id',
      organizationId,
      status: 'open',
      createdAt: '2026-07-31T09:00:00.000Z',
    });
    expect(appendQuestionMessage).toHaveBeenCalledTimes(2);
    expect(appendQuestionMessage).toHaveBeenNthCalledWith(2, {
      integratorQuestionMessageId: 'question-message-1',
      integratorQuestionId: 'question-1',
      organizationId,
      senderRole: 'user',
      text: 'Нужна помощь',
      createdAt: '2026-07-31T09:00:00.000Z',
    });
    expect(markQuestionAnswered).toHaveBeenCalledWith({
      integratorQuestionId: 'question-1',
      organizationId,
      answeredAt: '2026-07-31T09:05:00.000Z',
    });
  });

  it('denies a question write for a different organization before the canonical port', async () => {
    const questionPort: IntegratorSupportQuestionOwnershipPort = {
      createQuestion: vi.fn(),
      appendQuestionMessage: vi.fn(),
      markQuestionAnswered: vi.fn(),
      recordDeliveryAttempt: vi.fn(),
    };
    const bridge = createIntegratorSupportBridge({
      port: {
        ensureWebappConversationForUser: vi.fn(),
        appendWebappMessage: vi.fn(),
        setConversationStatusFromProjection: vi.fn(),
      },
      questionPort,
      resolvePatientOrganization: vi.fn().mockResolvedValue({
        ok: true,
        organizationId: '11111111-1111-4111-8111-111111111111',
      }),
      withOrganizationPrincipal: async (_organizationId, fn) => fn(),
    });

    const result = await bridge.syncQuestionWrite({
      operation: 'create',
      integratorConversationId:
        'webapp:organization:11111111-1111-4111-8111-111111111111:platform:22222222-2222-4222-8222-222222222222',
      integratorQuestionId: 'question-foreign',
      organizationId: '33333333-3333-4333-8333-333333333333',
      status: 'open',
      createdAt: '2026-07-31T09:00:00.000Z',
    });

    expect(result).toEqual({ ok: false, error: 'organization_mismatch' });
    expect(questionPort.createQuestion).not.toHaveBeenCalled();
  });

  it('records a delivery attempt in the webapp-owned audit port', async () => {
    const recordDeliveryAttempt = vi.fn().mockResolvedValue({
      id: 'delivery-db-id',
      created: true,
    });
    const bridge = createIntegratorSupportBridge({
      port: {
        ensureWebappConversationForUser: vi.fn(),
        appendWebappMessage: vi.fn(),
        setConversationStatusFromProjection: vi.fn(),
      },
      questionPort: {
        createQuestion: vi.fn(),
        appendQuestionMessage: vi.fn(),
        markQuestionAnswered: vi.fn(),
        recordDeliveryAttempt,
      },
      resolvePatientOrganization: vi.fn(),
      withOrganizationPrincipal: async (_organizationId, fn) => fn(),
    });
    const input = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      integratorIntentEventId: 'intent-1',
      correlationId: 'correlation-1',
      channelCode: 'telegram',
      status: 'success',
      attempt: 1,
      reason: null,
      payloadJson: { kind: 'support' },
      occurredAt: '2026-07-31T09:00:00.000Z',
    };

    const result = await bridge.syncDeliveryAttempt(input);

    expect(result).toEqual({
      ok: true,
      canonicalWrite: {
        deliveryAttemptId: 'intent-1',
        organizationId: input.organizationId,
      },
    });
    expect(recordDeliveryAttempt).toHaveBeenCalledWith(input);
  });

  it('applyAdminReply delivers the doctor reply to the patient encoded in integratorConversationId, not another patient', async () => {
    const targetPlatformUserId = '22222222-2222-4222-8222-222222222222';
    const otherPlatformUserId = '33333333-3333-4333-8333-333333333333';
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const ensureWebappConversationForUser = vi.fn(async (platformUserId: string) => ({
      id: `conversation-for-${platformUserId}`,
    }));
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: 'message-db-id', created: true });
    const resolvePatientOrganization = vi
      .fn()
      .mockResolvedValue({ ok: true, organizationId } as const);
    const notifyPatientOfDoctorReply = vi.fn().mockResolvedValue(undefined);
    const bridge = createIntegratorSupportBridge({
      port: {
        ensureWebappConversationForUser,
        appendWebappMessage,
        setConversationStatusFromProjection: vi.fn(),
      },
      questionPort: {
        createQuestion: vi.fn(),
        appendQuestionMessage: vi.fn(),
        markQuestionAnswered: vi.fn(),
        recordDeliveryAttempt: vi.fn(),
      },
      resolvePatientOrganization,
      withOrganizationPrincipal: async (_organizationId, fn) => fn(),
      notifyPatientOfDoctorReply,
    });

    const result = await bridge.applyAdminReply({
      integratorConversationId: `webapp:platform:${targetPlatformUserId}`,
      integratorMessageId: 'admin-message-1',
      text: 'Через час подойдёт, пейте по инструкции.',
      createdAt: '2026-07-31T09:10:00.000Z',
    });

    expect(result).toEqual({ ok: true });
    expect(resolvePatientOrganization).toHaveBeenCalledWith(targetPlatformUserId, undefined);
    expect(ensureWebappConversationForUser).toHaveBeenCalledWith(targetPlatformUserId);
    expect(appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: `conversation-for-${targetPlatformUserId}`,
        senderRole: 'admin',
        text: 'Через час подойдёт, пейте по инструкции.',
      }),
    );
    expect(notifyPatientOfDoctorReply).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: targetPlatformUserId }),
    );
    expect(notifyPatientOfDoctorReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: otherPlatformUserId }),
    );
  });
});
