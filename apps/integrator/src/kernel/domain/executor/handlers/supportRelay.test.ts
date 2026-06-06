import { describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';

const { applyWebappAdminReplyFromMessengerMock } = vi.hoisted(() => ({
  applyWebappAdminReplyFromMessengerMock: vi.fn(),
}));

vi.mock('../../support/webappSupportSync.js', () => ({
  adminReplyConversationId: (conversationId: string) => conversationId,
  applyWebappAdminReplyFromMessenger: (...args: unknown[]) => applyWebappAdminReplyFromMessengerMock(...args),
  mirrorPatientUserMessageToWebapp: vi.fn(),
  resolvePlatformUserIdForChannel: vi.fn(),
}));

import { handleConversationAdminReply, handleConversationUserMessage } from './supportRelay.js';

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
