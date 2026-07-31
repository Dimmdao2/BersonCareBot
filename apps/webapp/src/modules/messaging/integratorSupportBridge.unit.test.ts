import { describe, expect, it, vi } from 'vitest';
import { createIntegratorSupportBridge } from '@/modules/messaging/integratorSupportBridge';
import type { IntegratorSupportOwnershipPort } from '@/modules/messaging/ports';

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
    const bridge = createIntegratorSupportBridge({
      port,
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
      integratorConversationId:
        'webapp:platform:22222222-2222-4222-8222-222222222222',
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
});
