import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();
const sendPhotoMock = vi.fn();
const copyMessageMock = vi.fn();
const editMessageTextMock = vi.fn();
const editMessageReplyMarkupMock = vi.fn();
const deleteMessageMock = vi.fn();
const answerCallbackQueryMock = vi.fn();

vi.mock('./client.js', () => ({
  createMessagingPort: () => ({
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
    sendPhoto: (...args: unknown[]) => sendPhotoMock(...args),
    copyMessage: (...args: unknown[]) => copyMessageMock(...args),
    editMessageText: (...args: unknown[]) => editMessageTextMock(...args),
    editMessageReplyMarkup: (...args: unknown[]) => editMessageReplyMarkupMock(...args),
    deleteMessage: (...args: unknown[]) => deleteMessageMock(...args),
    answerCallbackQuery: (...args: unknown[]) => answerCallbackQueryMock(...args),
  }),
}));

import { createTelegramDeliveryAdapter } from './deliveryAdapter.js';

const CHAT_ID = 364943522;

function buildIntent(payload: Record<string, unknown>) {
  return {
    type: 'message.send' as const,
    meta: { eventId: 'e', occurredAt: '', source: 'telegram' as const },
    payload: {
      recipient: { chatId: CHAT_ID },
      delivery: { channels: ['telegram'] },
      ...payload,
    },
  };
}

describe('telegram deliveryAdapter — sendPhoto (broadcast image)', () => {
  beforeEach(() => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValue({ message_id: 10 });
    sendPhotoMock.mockClear();
    sendPhotoMock.mockResolvedValue({ message_id: 77 });
  });

  it('imageUrl + short text → sendPhoto with caption=text, sendMessage NOT called', async () => {
    const adapter = createTelegramDeliveryAdapter();
    const result = await adapter.send(
      buildIntent({
        message: { text: 'hello world' },
        imageUrl: 'https://cdn.example.com/pic.jpg',
      }),
    );

    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    const photoCall = sendPhotoMock.mock.calls[0]?.[0] as { chat_id: number; photo: string; caption?: string };
    expect(photoCall.chat_id).toBe(CHAT_ID);
    expect(photoCall.photo).toBe('https://cdn.example.com/pic.jpg');
    expect(photoCall.caption).toBe('hello world');
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ telegramMessageId: 77 });
  });

  it('imageUrl + text > 1024 chars → sendPhoto without caption + sendMessage(text)', async () => {
    const longText = 'a'.repeat(1500);
    const adapter = createTelegramDeliveryAdapter();
    const result = await adapter.send(
      buildIntent({
        message: { text: longText },
        imageUrl: 'https://cdn.example.com/pic.jpg',
      }),
    );

    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    const photoCall = sendPhotoMock.mock.calls[0]?.[0] as { caption?: string };
    expect(photoCall.caption).toBeUndefined();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const msgCall = sendMessageMock.mock.calls[0]?.[0] as { text: string };
    expect(msgCall.text).toBe(longText);

    // returns telegramMessageId of the PHOTO message
    expect(result).toEqual({ telegramMessageId: 77 });
  });

  it('imageUrl + sendPhoto throws → falls back to sendMessage(text)', async () => {
    sendPhotoMock.mockRejectedValueOnce(new Error('Bad Request: failed to get HTTP URL content'));
    const adapter = createTelegramDeliveryAdapter();
    const result = await adapter.send(
      buildIntent({
        message: { text: 'fallback text' },
        imageUrl: 'https://cdn.example.com/broken.jpg',
      }),
    );

    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const msgCall = sendMessageMock.mock.calls[0]?.[0] as { text: string };
    expect(msgCall.text).toBe('fallback text');
    expect(result).toEqual({ telegramMessageId: 10 });
  });

  it('no imageUrl → plain sendMessage (unchanged), sendPhoto NOT called', async () => {
    const adapter = createTelegramDeliveryAdapter();
    const result = await adapter.send(
      buildIntent({
        message: { text: 'just text' },
      }),
    );

    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const msgCall = sendMessageMock.mock.calls[0]?.[0] as { text: string };
    expect(msgCall.text).toBe('just text');
    expect(result).toEqual({ telegramMessageId: 10 });
  });
});
