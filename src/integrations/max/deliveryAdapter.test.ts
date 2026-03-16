import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMaxMessageMock = vi.fn();
const answerMaxCallbackMock = vi.fn();
const editMaxMessageMock = vi.fn();
vi.mock('./client.js', () => ({
  sendMaxMessage: (...args: unknown[]) => sendMaxMessageMock(...args),
  answerMaxCallback: (...args: unknown[]) => answerMaxCallbackMock(...args),
  editMaxMessage: (...args: unknown[]) => editMaxMessageMock(...args),
}));
vi.mock('./config.js', () => ({ maxConfig: { apiKey: 'test-key' } }));

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
      expect.objectContaining({ userId: 200, text: 'Hello' }),
    );
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
      { callbackId: 'cb-99' },
    );
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
