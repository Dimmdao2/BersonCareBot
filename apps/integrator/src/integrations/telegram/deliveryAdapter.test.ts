import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();
const copyMessageMock = vi.fn();
const editMessageTextMock = vi.fn();
const editMessageReplyMarkupMock = vi.fn();
const deleteMessageMock = vi.fn();
const answerCallbackQueryMock = vi.fn();

vi.mock('./client.js', () => ({
  createMessagingPort: () => ({
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
    copyMessage: (...args: unknown[]) => copyMessageMock(...args),
    editMessageText: (...args: unknown[]) => editMessageTextMock(...args),
    editMessageReplyMarkup: (...args: unknown[]) => editMessageReplyMarkupMock(...args),
    deleteMessage: (...args: unknown[]) => deleteMessageMock(...args),
    answerCallbackQuery: (...args: unknown[]) => answerCallbackQueryMock(...args),
  }),
}));

import { createTelegramDeliveryAdapter } from './deliveryAdapter.js';

describe('telegram deliveryAdapter', () => {
  beforeEach(() => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValue({ message_id: 1 });
    copyMessageMock.mockClear();
    copyMessageMock.mockResolvedValue(true);
    editMessageTextMock.mockClear();
    editMessageTextMock.mockResolvedValue(true);
    editMessageReplyMarkupMock.mockClear();
    editMessageReplyMarkupMock.mockResolvedValue(true);
    deleteMessageMock.mockClear();
    deleteMessageMock.mockResolvedValue(true);
    answerCallbackQueryMock.mockClear();
    answerCallbackQueryMock.mockResolvedValue(true);
  });

  it('drops invalid callback_data buttons for message.send', async () => {
    const adapter = createTelegramDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'telegram' },
      payload: {
        recipient: { chatId: 364943522 },
        message: { text: 'hello' },
        delivery: { channels: ['telegram'] },
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'OK', callback_data: 'menu.ok' }],
            [{ text: 'Too long', callback_data: `x${'y'.repeat(64)}` }],
            [{ text: 'Bad type', callback_data: 123 }],
            [{ text: 'Link', url: 'https://example.com' }],
          ],
        },
      },
    });

    const call = sendMessageMock.mock.calls[0]?.[0] as { reply_markup?: { inline_keyboard?: unknown[] } };
    expect(call.reply_markup?.inline_keyboard).toEqual([
      [{ text: 'OK', callback_data: 'menu.ok' }],
      [{ text: 'Link', url: 'https://example.com' }],
    ]);
  });

  it('keeps callback_data with exactly 64 UTF-8 bytes', async () => {
    const callbackData64 = 'x'.repeat(64);
    const adapter = createTelegramDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'telegram' },
      payload: {
        recipient: { chatId: 364943522 },
        message: { text: 'hello' },
        delivery: { channels: ['telegram'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'Boundary', callback_data: callbackData64 }]],
        },
      },
    });

    const call = sendMessageMock.mock.calls[0]?.[0] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> };
    };
    expect(call.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(callbackData64);
  });

  it('sanitizes invalid callback_data in message.replyMarkup.edit', async () => {
    const adapter = createTelegramDeliveryAdapter();
    await adapter.send({
      type: 'message.replyMarkup.edit',
      meta: { eventId: 'e', occurredAt: '', source: 'telegram' },
      payload: {
        recipient: { chatId: 364943522 },
        messageId: 42,
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'Long', callback_data: 'z'.repeat(65) }],
            [{ text: 'Back', callback_data: 'menu.back' }],
          ],
        },
      },
    });

    const call = editMessageReplyMarkupMock.mock.calls[0]?.[0] as { reply_markup?: { inline_keyboard?: unknown[] } };
    expect(call.reply_markup?.inline_keyboard).toEqual([
      [{ text: 'Back', callback_data: 'menu.back' }],
    ]);
  });
});
