import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMaxMessageMock = vi.fn();
const answerMaxCallbackMock = vi.fn();
const editMaxMessageMock = vi.fn();
const deleteMaxMessageMock = vi.fn();
vi.mock('./client.js', () => ({
  sendMaxMessage: (...args: unknown[]) => sendMaxMessageMock(...args),
  answerMaxCallback: (...args: unknown[]) => answerMaxCallbackMock(...args),
  editMaxMessage: (...args: unknown[]) => editMaxMessageMock(...args),
  deleteMaxMessage: (...args: unknown[]) => deleteMaxMessageMock(...args),
}));
vi.mock('./runtimeConfig.js', () => ({ getMaxApiKey: async () => 'test-key' }));

import { createMaxDeliveryAdapter } from './deliveryAdapter.js';

describe('max deliveryAdapter', () => {
  beforeEach(() => {
    sendMaxMessageMock.mockClear();
    sendMaxMessageMock.mockResolvedValue({});
    answerMaxCallbackMock.mockClear();
    answerMaxCallbackMock.mockResolvedValue(true);
    editMaxMessageMock.mockClear();
    editMaxMessageMock.mockResolvedValue(true);
    deleteMaxMessageMock.mockClear();
    deleteMaxMessageMock.mockResolvedValue(true);
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

  it('send message.send maps inline request_contact button', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'Confirm phone' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'Share', request_contact: true }]],
        },
      },
    });
    expect(sendMaxMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'request_contact', text: 'Share' }]],
              },
            }),
          ]),
        }),
      }),
    );
  });

  it('send message.send maps a row of three web_app buttons to three open_app (main menu parity)', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max', userId: '1' },
      payload: {
        recipient: { chatId: 42 },
        message: { text: 'hello' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[
            { text: 'A', web_app: { url: 'https://app.example/a' } },
            { text: 'B', web_app: { url: 'https://app.example/b' } },
            { text: 'C', web_app: { url: 'https://app.example/c' } },
          ]],
        },
      },
    });
    const call = sendMaxMessageMock.mock.calls[0]?.[1] as { extra?: { attachments?: unknown[] } };
    const row = (call?.extra?.attachments?.[0] as { payload?: { buttons?: unknown[][] } })?.payload?.buttons?.[0] as Array<{ type?: string; web_app?: string }>;
    expect(row).toHaveLength(3);
    expect(row?.every((b) => b.type === 'open_app')).toBe(true);
    expect(row?.[0]?.web_app).toBe('https://app.example/a');
    expect(row?.[2]?.web_app).toBe('https://app.example/c');
  });

  it('send message.send maps Telegram-style web_app button to MAX open_app (contact_id from recipient.chatId)', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max', userId: '207278131' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'Open app' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'Веб-приложение', web_app: { url: 'https://app.example/app/max?t=dummy' } }]],
        },
      },
    });
    expect(sendMaxMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    {
                      type: 'open_app',
                      text: 'Веб-приложение',
                      web_app: 'https://app.example/app/max?t=dummy',
                      contact_id: 200,
                    },
                  ],
                ],
              },
            }),
          ]),
        }),
      }),
    );
  });

  it('send message.send prefers recipient.chatId over meta.userId for contact_id (multi-channel fan-out safe)', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'rubitime', userId: '999999999' },
      payload: {
        recipient: { chatId: 555 },
        message: { text: 'x' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'App', web_app: { url: 'https://app.example/a' } }]],
        },
      },
    });
    const call = sendMaxMessageMock.mock.calls[0]?.[1] as { extra?: { attachments?: unknown[] } };
    const btn = (call?.extra?.attachments?.[0] as { payload?: { buttons?: unknown[][] } })?.payload?.buttons?.[0]?.[0] as Record<string, unknown>;
    expect(btn?.contact_id).toBe(555);
  });

  it('send message.replyMarkup.edit falls back to meta.userId when recipient.chatId absent', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.replyMarkup.edit',
      meta: { eventId: 'e', occurredAt: '', source: 'max', userId: '777' },
      payload: {
        messageId: 'm1',
        replyMarkup: {
          inline_keyboard: [[{ text: 'App', web_app: { url: 'https://app.example/x' } }]],
        },
      },
    });
    const call = editMaxMessageMock.mock.calls[0]?.[1] as { extra?: { attachments?: unknown[] } };
    const btn = (call?.extra?.attachments?.[0] as { payload?: { buttons?: unknown[][] } })?.payload?.buttons?.[0]?.[0] as Record<string, unknown>;
    expect(btn?.contact_id).toBe(777);
  });

  it('send message.send sets contact_id from recipient.chatId when meta.userId missing (DM / jobs)', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'Open' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'App', web_app: { url: 'https://app.example/x' } }]],
        },
      },
    });
    const call = sendMaxMessageMock.mock.calls[0]?.[1] as { extra?: { attachments?: unknown[] } };
    const btn = (call?.extra?.attachments?.[0] as { payload?: { buttons?: unknown[][] } })?.payload?.buttons?.[0]?.[0] as Record<string, unknown>;
    expect(btn?.type).toBe('open_app');
    expect(btn?.web_app).toBe('https://app.example/x');
    expect(btn?.contact_id).toBe(200);
  });

  it('send message.send maps reply keyboard web_app rows to open_app (merged with inline)', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 42 },
        message: { text: 'Menu' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          keyboard: [[{ text: 'Home', web_app: { url: 'https://app.example/' } }]],
          inline_keyboard: [[{ text: 'Inline', web_app: { url: 'https://app.example/i' } }]],
        },
      },
    });
    const call = sendMaxMessageMock.mock.calls[0]?.[1] as { extra?: { attachments?: unknown[] } };
    const rows = (call?.extra?.attachments?.[0] as { payload?: { buttons?: Record<string, unknown>[][] } })?.payload?.buttons;
    expect(rows).toHaveLength(2);
    expect(rows?.[0]?.[0]?.type).toBe('open_app');
    expect(rows?.[0]?.[0]?.web_app).toBe('https://app.example/i');
    expect(rows?.[1]?.[0]?.type).toBe('open_app');
    expect(rows?.[1]?.[0]?.web_app).toBe('https://app.example/');
    expect(rows?.[0]?.[0]?.contact_id).toBe(42);
  });

  it('send message.send maps plain url button to MAX link', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'See site' },
        delivery: { channels: ['max'] },
        replyMarkup: {
          inline_keyboard: [[{ text: 'Сайт', url: 'https://example.com/' }]],
        },
      },
    });
    expect(sendMaxMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'link', text: 'Сайт', url: 'https://example.com/' }]],
              },
            }),
          ]),
        }),
      }),
    );
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

  it('send callback.answer calls answerMaxCallback without notification when omitting text', async () => {
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

  it('send callback.answer forwards payload.text when no notification', async () => {
    const adapter = createMaxDeliveryAdapter();
    await adapter.send({
      type: 'callback.answer',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { callbackQueryId: 'cb-101', text: 'Сохранено' },
    });
    expect(answerMaxCallbackMock).toHaveBeenCalledWith(
      expect.any(Object),
      { callbackId: 'cb-101', extra: { notification: 'Сохранено' } },
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

  it('send message.send returns maxMessageId from API message body', async () => {
    sendMaxMessageMock.mockResolvedValueOnce({
      body: { mid: 'mid-out-1', seq: 1, text: 'Hello', attachments: null },
      recipient: { chat_id: 200, chat_type: 'dialog' },
      timestamp: 1,
    });
    const adapter = createMaxDeliveryAdapter();
    const res = await adapter.send({
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: {
        recipient: { chatId: 200 },
        message: { text: 'Hello' },
        delivery: { channels: ['max'] },
      },
    });
    expect(res).toEqual({ maxMessageId: 'mid-out-1' });
  });

  it('canHandle message.delete when source is max', () => {
    const adapter = createMaxDeliveryAdapter();
    expect(
      adapter.canHandle({
        type: 'message.delete',
        meta: { eventId: 'e', occurredAt: '', source: 'max' },
        payload: { messageId: 'x', delivery: { channels: ['max'] } },
      }),
    ).toBe(true);
  });

  it('send message.delete skips client and returns {} when messageId missing', async () => {
    const adapter = createMaxDeliveryAdapter();
    const res = await adapter.send({
      type: 'message.delete',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { delivery: { channels: ['max'] } },
    });
    expect(res).toEqual({});
    expect(deleteMaxMessageMock).not.toHaveBeenCalled();
  });

  it('send message.delete calls deleteMaxMessage and does not throw when client returns false', async () => {
    deleteMaxMessageMock.mockResolvedValueOnce(false);
    const adapter = createMaxDeliveryAdapter();
    const res = await adapter.send({
      type: 'message.delete',
      meta: { eventId: 'e', occurredAt: '', source: 'max' },
      payload: { messageId: 'stale-mid', delivery: { channels: ['max'] } },
    });
    expect(res).toEqual({});
    expect(deleteMaxMessageMock).toHaveBeenCalledWith(expect.any(Object), 'stale-mid');
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
