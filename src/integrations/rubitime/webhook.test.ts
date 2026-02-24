import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';
import type { SmsClient } from '../smsc/types.js';
import { rubitimeWebhookRoutes } from './webhook.js';

const token = 'secret-rubitime-token';

function buildApp(options?: {
  sendMessageImpl?: (chatId: number, text: string) => Promise<unknown>;
  sendSmsImpl?: SmsClient['sendSms'];
  findUserImpl?: (phoneNormalized: string) => Promise<{ chatId: number; telegramId: string; username: string | null } | null>;
  debugNotifyAdmin?: boolean;
}) {
  const sendMessage = vi.fn(options?.sendMessageImpl ?? (async () => undefined));
  const sendSms = vi.fn(options?.sendSmsImpl ?? (async () => ({ ok: false, error: 'SMSC_NOT_IMPLEMENTED' })));
  const insertEvent = vi.fn(async () => undefined);
  const upsertRecord = vi.fn(async () => undefined);
  const findTelegramUserByPhone = vi.fn(
    options?.findUserImpl ?? (async () => ({ chatId: 12345, telegramId: '12345', username: 'test_user' })),
  );

  const app = Fastify({ logger: false });
  rubitimeWebhookRoutes(app, {
    tgApi: { sendMessage },
    smsClient: { sendSms },
    insertEvent,
    upsertRecord,
    findTelegramUserByPhone,
    adminTelegramId: '99999',
    webhookToken: token,
    debugNotifyAdmin: options?.debugNotifyAdmin ?? false,
  });
  return { app, sendMessage, sendSms, insertEvent, upsertRecord, findTelegramUserByPhone };
}

function basePayload(event: 'event-create-record' | 'event-update-record' | 'event-remove-record') {
  return {
    from: 'rubitime',
    event,
    data: {
      id: 'rec-42',
      record: '2025-02-24 14:00',
      name: 'Иван',
      phone: '+79991234567',
      service: 'Стрижка',
    },
  };
}

describe('POST /webhook/rubitime', () => {
  it('returns 403 if token is missing', async () => {
    const { app, sendMessage } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: { id: '1', record: '2025-01-01 10:00' },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns 200 when token is provided in query', async () => {
    const { app } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime?token=${token}`,
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 200 when token is provided in path', async () => {
    const { app } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 403 if token is wrong', async () => {
    const { app, sendMessage } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': 'wrong-token' },
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: { id: '1' },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns 400 if body does not pass schema', async () => {
    const { app, sendMessage } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: {
        from: 'rubitime',
        event: 'invalid-event',
        data: {},
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: 'Invalid webhook body' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('CREATE + user found => sends formatted create text to user', async () => {
    const { app, sendMessage, sendSms, insertEvent, upsertRecord, findTelegramUserByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(upsertRecord).toHaveBeenCalledTimes(1);
    expect(findTelegramUserByPhone).toHaveBeenCalledWith('+79991234567');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      12345,
      expect.stringContaining('Иван, вы успешно записались на прием к Дмитрию Берсону'),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(1, 12345, expect.stringContaining('Дата и время: 2025-02-24 14:00'));
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('CREATE + user not found => sms called, admin called', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      findUserImpl: async () => null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 99999, expect.stringContaining('требуется SMS'));
  });

  it('CREATE + tg throws => sms called, admin called, status 200', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      sendMessageImpl: async (chatId) => {
        if (chatId === 12345) {
          throw new Error('Telegram API error');
        }
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('TRANSFER_REQUEST => sends formatted update text to user', async () => {
    const { app, sendMessage, sendSms } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-update-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 12345, expect.stringContaining('Ваша запись на прием к Дмитрию изменена:'));
    expect(sendMessage).toHaveBeenNthCalledWith(1, 12345, expect.stringContaining('Статус:'));
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('TRANSFER_REQUEST => fallback when user not found', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      findUserImpl: async () => null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-update-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 99999, expect.stringContaining('требуется SMS'));
  });

  it('CANCEL => sends formatted cancel text to user', async () => {
    const { app, sendMessage, sendSms } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-remove-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 12345, expect.stringContaining('Отменена ваша запись к Дмитрию'));
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('CANCEL => fallback when user not found', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      findUserImpl: async () => null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-remove-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 99999, expect.stringContaining('требуется SMS'));
  });

  it('does not notify admin when user telegram send fails', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      sendMessageImpl: async (chatId) => {
        if (chatId === 12345) throw new Error('Telegram API error');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-update-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 12345, expect.any(String));
  });

  it('sends raw payload to admin only when debug flag enabled', async () => {
    const { app, sendMessage } = buildApp({ debugNotifyAdmin: true });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 99999, expect.stringContaining('Rubitime webhook payload (raw)'));
    expect(sendMessage).toHaveBeenNthCalledWith(2, 12345, expect.any(String));
  });
});
