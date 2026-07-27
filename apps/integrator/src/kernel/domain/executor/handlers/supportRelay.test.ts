import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';

const {
  applyWebappAdminReplyFromMessengerMock,
  mirrorPatientUserMessageToWebappMock,
  resolvePlatformUserIdForChannelMock,
} = vi.hoisted(() => ({
  applyWebappAdminReplyFromMessengerMock: vi.fn(),
  mirrorPatientUserMessageToWebappMock: vi.fn(),
  resolvePlatformUserIdForChannelMock: vi.fn(),
}));

vi.mock('../../support/webappSupportSync.js', () => ({
  adminReplyConversationId: (conversationId: string) => conversationId,
  applyWebappAdminReplyFromMessenger: (...args: unknown[]) => applyWebappAdminReplyFromMessengerMock(...args),
  mirrorPatientUserMessageToWebapp: (...args: unknown[]) => mirrorPatientUserMessageToWebappMock(...args),
  resolvePlatformUserIdForChannel: (...args: unknown[]) => resolvePlatformUserIdForChannelMock(...args),
}));

import {
  buildDoctorPatientMessageNotificationText,
  handleConversationAdminReply,
  handleConversationUserMessage,
} from './supportRelay.js';

const baseCtx = (): DomainContext => ({
  event: {
    type: 'webhook.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-04-02T12:00:00.000Z',
      source: 'telegram',
    },
    payload: {},
  },
  nowIso: '2026-04-02T12:00:00.000Z',
  values: {},
  base: {
    actor: { isAdmin: false },
    identityLinks: [],
    conversationState: 'waiting_skip_reason:occ-123',
  },
});

describe('handleConversationUserMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePlatformUserIdForChannelMock.mockResolvedValue(null);
    mirrorPatientUserMessageToWebappMock.mockResolvedValue(false);
  });

  it('does not relay user text to admin when collecting skip reason (S3.T07)', async () => {
    const readDb = vi.fn();
    const action: Action = {
      id: 'a-skip-guard',
      type: 'conversation.user.message',
      mode: 'sync',
      params: { source: 'telegram', text: 'my private skip reason' },
    };
    const deps = { readPort: { readDb } } as unknown as ExecutorDeps;
    const res = await handleConversationUserMessage(action, baseCtx(), deps);
    expect(res.status).toBe('skipped');
    expect(res.error).toBe('CONVERSATION_USER_BLOCKED_SKIP_REASON');
    expect(readDb).not.toHaveBeenCalled();
  });

  it('mirrors the patient text to webapp without copying it into the doctor messenger chat', async () => {
    const platformUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    resolvePlatformUserIdForChannelMock.mockResolvedValue(platformUserId);
    mirrorPatientUserMessageToWebappMock.mockResolvedValue(true);
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const action: Action = {
      id: 'a-notification-only',
      type: 'conversation.user.message',
      mode: 'sync',
      params: { source: 'telegram' },
    };
    const ctx: DomainContext = {
      ...baseCtx(),
      base: { ...baseCtx().base, conversationState: 'idle', facts: { adminChatId: 999 } },
      event: {
        ...baseCtx().event,
        payload: {
          incoming: {
            kind: 'message',
            chatId: 123,
            channelId: '123',
            messageId: 77,
            text: 'PRIVATE_PATIENT_MESSAGE',
            relayMessageType: 'text',
          },
        },
      },
    };
    const deps = {
      readPort: {
        readDb: vi.fn().mockResolvedValue({
          id: 'conv-1',
          first_name: 'Анна',
          last_name: 'Иванова',
          user_channel_id: '123',
        }),
      },
      writePort: { writeDb },
    } as unknown as ExecutorDeps;

    const result = await handleConversationUserMessage(action, ctx, deps);

    expect(result.status).toBe('success');
    expect(result.intents).toEqual([]);
    expect(mirrorPatientUserMessageToWebappMock).toHaveBeenCalledWith(
      deps,
      expect.objectContaining({
        platformUserId,
        text: 'PRIVATE_PATIENT_MESSAGE',
      }),
    );
  });

  it.each([
    '+79991234567',
    'patient@example.com',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ])('uses a neutral fallback instead of unsafe patient label %s', (unsafeLabel) => {
    expect(buildDoctorPatientMessageNotificationText({ displayName: unsafeLabel }))
      .toBe('новое сообщение от пациента');
  });
});

describe('handleConversationAdminReply', () => {
  it('uses admin_reply callback for continue button in webapp platform flow', async () => {
    applyWebappAdminReplyFromMessengerMock.mockResolvedValue({ ok: true });
    const writeDb = vi.fn();
    const action: Action = {
      id: 'a-reply-webapp',
      type: 'conversation.admin.reply',
      mode: 'sync',
      params: {
        conversationId: 'webapp:platform:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        text: 'Ответ',
      },
    };
    const deps = {
      readPort: { readDb: vi.fn() },
      writePort: { writeDb },
    } as unknown as ExecutorDeps;

    const res = await handleConversationAdminReply(action, {
      ...baseCtx(),
      base: { ...baseCtx().base, actor: { isAdmin: true } },
      event: {
        ...baseCtx().event,
        payload: {
          incoming: { chatId: 364943522, messageId: 77 },
        },
      },
    }, deps);

    expect(res.status).toBe('success');
    const sentConfirmation = res.intents?.find((intent) => intent.type === 'message.send');
    const firstButton = ((sentConfirmation?.payload as { replyMarkup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> } })
      ?.replyMarkup?.inline_keyboard?.[0]?.[0]);
    expect(firstButton?.callback_data).toBe('admin_reply:webapp:platform:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const webappReplyInput = applyWebappAdminReplyFromMessengerMock.mock.calls[0]?.[1];
    expect(webappReplyInput).not.toHaveProperty('senderDisplayName');
  });

  it('uses admin_reply callback for continue button in legacy flow', async () => {
    const writeDb = vi.fn();
    const readDb = vi.fn().mockResolvedValue({
      id: 'legacy-conv',
      source: 'telegram',
      user_chat_id: '7924656602',
    });
    const action: Action = {
      id: 'a-reply-legacy',
      type: 'conversation.admin.reply',
      mode: 'sync',
      params: {
        conversationId: 'legacy-conv',
        text: 'Ответ',
      },
    };
    const deps = {
      readPort: { readDb },
      writePort: { writeDb },
    } as unknown as ExecutorDeps;

    const res = await handleConversationAdminReply(action, {
      ...baseCtx(),
      base: { ...baseCtx().base, actor: { isAdmin: true } },
      event: {
        ...baseCtx().event,
        payload: {
          incoming: { chatId: 364943522, messageId: 88 },
        },
      },
    }, deps);

    expect(res.status).toBe('success');
    const sentToAdmin = res.intents?.filter((intent) => intent.type === 'message.send') ?? [];
    const confirmation = sentToAdmin[sentToAdmin.length - 1];
    const firstButton = ((confirmation?.payload as { replyMarkup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> } })
      ?.replyMarkup?.inline_keyboard?.[0]?.[0]);
    expect(firstButton?.callback_data).toBe('admin_reply:legacy-conv');
  });
});
