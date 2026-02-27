import { describe, expect, it, vi } from 'vitest';
import { createMessageByPhoneDispatcher } from './messageByPhone.js';

describe('createMessageByPhoneDispatcher', () => {
  it('falls back to sms when phone is missing', async () => {
    const sendSms = vi.fn(async () => ({ ok: true as const }));
    const dispatcher = createMessageByPhoneDispatcher({
      findTelegramUserByPhone: vi.fn(async () => null),
      sendTelegramMessage: vi.fn(async () => undefined),
      smsClient: { sendSms },
      retryPolicy: { retries: 0, factor: 1, minTimeout: 1, maxTimeout: 1, randomize: false },
    });

    await dispatcher.dispatchMessageByPhone({
      phoneNormalized: '',
      messageText: 'test',
      smsFallbackText: 'fallback',
    });

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith({ toPhone: '', message: 'fallback' });
  });

  it('falls back to sms when telegram user is not found', async () => {
    const sendSms = vi.fn(async () => ({ ok: true as const }));
    const dispatcher = createMessageByPhoneDispatcher({
      findTelegramUserByPhone: vi.fn(async () => null),
      sendTelegramMessage: vi.fn(async () => undefined),
      smsClient: { sendSms },
      retryPolicy: { retries: 0, factor: 1, minTimeout: 1, maxTimeout: 1, randomize: false },
    });

    await dispatcher.dispatchMessageByPhone({
      phoneNormalized: '+79991234567',
      messageText: 'test',
      smsFallbackText: 'fallback',
    });

    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('aborts retries on permanent telegram error and falls back', async () => {
    const sendSms = vi.fn(async () => ({ ok: true as const }));
    const sendTelegramMessage = vi.fn(async () => {
      throw { error_code: 403 };
    });
    const dispatcher = createMessageByPhoneDispatcher({
      findTelegramUserByPhone: vi.fn(async () => ({ chatId: 1, telegramId: '1', username: null })),
      sendTelegramMessage,
      smsClient: { sendSms },
      retryPolicy: { retries: 2, factor: 1, minTimeout: 1, maxTimeout: 1, randomize: false },
    });

    await dispatcher.dispatchMessageByPhone({
      phoneNormalized: '+79991234567',
      messageText: 'test',
      smsFallbackText: 'fallback',
    });

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('retries transient telegram errors and succeeds without sms fallback', async () => {
    const sendSms = vi.fn(async () => ({ ok: true as const }));
    const sendTelegramMessage = vi
      .fn<(chatId: number, text: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('network 1'))
      .mockRejectedValueOnce(new Error('network 2'))
      .mockResolvedValueOnce(undefined);
    const dispatcher = createMessageByPhoneDispatcher({
      findTelegramUserByPhone: vi.fn(async () => ({ chatId: 1, telegramId: '1', username: null })),
      sendTelegramMessage,
      smsClient: { sendSms },
      retryPolicy: { retries: 2, factor: 1, minTimeout: 1, maxTimeout: 1, randomize: false },
    });

    await dispatcher.dispatchMessageByPhone({
      phoneNormalized: '+79991234567',
      messageText: 'test',
      smsFallbackText: 'fallback',
    });

    expect(sendTelegramMessage).toHaveBeenCalledTimes(3);
    expect(sendSms).not.toHaveBeenCalled();
  });
});
