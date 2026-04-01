import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMaxMessageMock = vi.fn();
const answerMaxCallbackMock = vi.fn();
const editMaxMessageMock = vi.fn();
vi.mock('./client.js', () => ({
  sendMaxMessage: (...args: unknown[]) => sendMaxMessageMock(...args),
  answerMaxCallback: (...args: unknown[]) => answerMaxCallbackMock(...args),
  editMaxMessage: (...args: unknown[]) => editMaxMessageMock(...args),
}));
vi.mock('./runtimeConfig.js', () => ({ getMaxApiKey: async () => 'test-key' }));

import { createMaxDeliveryAdapter } from './deliveryAdapter.js';

describe('max deliveryAdapter', () => {
  beforeEach(() => {
    sendMaxMessageMock.mockResolvedValue({});
    answerMaxCallbackMock.mockResolvedValue(true);
    editMaxMessageMock.mockResolvedValue(true);
  });

  it('canHandle message.send when channel is max', () => {
    const adapter = createMaxDeliveryAdapter();
    const intent = {
      type: 'message.send' as const,
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 100 },
        message: { text: 'Hi' },
        delivery: { channels: ['max'] },
      },
    };
    expect(adapter.canHandle(intent)).toBe(true);
  });

  it('canHandle callback.answer when source is max', () => {
    const adapter = createMaxDeliveryAdapter();
    const intent = {
      type: 'callback.answer' as const,
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { callbackQueryId: 'cb-1' },
    };
    expect(adapter.canHandle(intent)).toBe(true);
  });

  it('canHandle message.replyMarkup.edit when source is max', () => {
    const adapter = createMaxDeliveryAdapter();
    const intent = {
      type: 'message.replyMarkup.edit' as const,
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { messageId: 'mid-1', replyMarkup: { inline_keyboard: [] } },
    };
    expect(adapter.canHandle(intent)).toBe(true);
  });

  it('does not handle message.send for telegram channel', () => {
    const adapter = createMaxDeliveryAdapter();
    const intent = {
      type: 'message.send' as const,
      meta: { eventId: 'e', occurredAt: '', source: 'telegram' },
      payload: { recipient: { chatId: 1 }, message: { text: 'x' }, delivery: { channels: ['telegram'] } },
    };
    expect(adapter.canHandle(intent)).toBe(false);
  });

  it('send message.send calls sendMaxMessage', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'Hello' },
        delivery: { channels: ['max'] },
      },
    });
    expect(sendMaxMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key' }),
      expect.objectContaining({
        chatId: 200,
        text: 'Hello',
        extra: {},
      }),
    );
  });

  it('send message.send throws when MAX client returns null', async () => {
    sendMaxMessageMock.mockResolvedValueOnce(null);
    const adapter = createMaxDeliveryAdapter();
    await expect(
      adapter.send({
        type: 'message.send',
        meta: { eventId: 'e', occurredAt: '', source: 'max' },
        payload: {
          recipient: { chatId: 200 },
          message: { text: 'Hello' },
          delivery: { channels: ['max'] },
        },
      }),
    ).rejects.toThrow('MAX_SEND_FAILED');
  });

  it('send callback.answer calls answerMaxCallback', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'callback.answer',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { callbackQueryId: 'cb-99' },
    });
    expect(answerMaxCallbackMock).toHaveBeenCalledWith(
      expect.any(Object),
      { callbackId: 'cb-99', extra: { notification: 'OK' } },
    );
  });

  it('send callback.answer keeps explicit notification', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'callback.answer',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { callbackQueryId: 'cb-100', notification: 'Открываю диалог' },
    });
    expect(answerMaxCallbackMock).toHaveBeenCalledWith(
      expect.any(Object),
      { callbackId: 'cb-100', extra: { notification: 'Открываю диалог' } },
    );
  });

  it('send message.edit keeps string messageId', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.edit',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        messageId: 'mid-42',
        message: { text: 'Updated' },
        delivery: { channels: ['max'] },
      },
    });
    expect(editMaxMessageMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messageId: 'mid-42',
        extra: expect.objectContaining({ text: 'Updated' }),
      }),
    );
  });

  it('send replyMarkup.edit calls editMaxMessage', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.replyMarkup.edit',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        messageId: 'mid-99',
        replyMarkup: {
          inline_keyboard: [[{ text: 'Open', callback_data: 'menu.more' }]],
        },
      },
    });
    expect(editMaxMessageMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messageId: 'mid-99',
      }),
    );
  });

  it('send message.edit throws when MAX client returns false', async () => {
    editMaxMessageMock.mockResolvedValueOnce(false);
    const adapter = createMaxDeliveryAdapter();
    await expect(
      adapter.send({
        type: 'message.edit',
        meta: { eventId: 'e', occurredAt: '', source: 'max' },
        payload: {
          messageId: 'mid-42',
          message: { text: 'Updated' },
        },
      }),
    ).rejects.toThrow('MAX_EDIT_FAILED');
  });

  it('send callback.answer throws when MAX client returns false', async () => {
    answerMaxCallbackMock.mockResolvedValueOnce(false);
    const adapter = createMaxDeliveryAdapter();
    await expect(
      adapter.send({
        type: 'callback.answer',
        meta: { eventId: 'e', occurredAt: '', source: 'max' },
        payload: { callbackQueryId: 'cb-99' },
      }),
    ).rejects.toThrow('MAX_CALLBACK_ANSWER_FAILED');
  });

  it('send message.send throws when chatId missing', async () => {
    const adapter = createMaxDeliveryAdapter();
    await expect(
      adapter.send({
        type: 'message.send',
        meta: { eventId: 'e', occurredAt: '', source: 'max' },
        payload: { message: { text: 'x' }, delivery: { channels: ['max'] } },
      }),
    ).rejects.toThrow('MAX_PAYLOAD_INVALID');
  });
});
