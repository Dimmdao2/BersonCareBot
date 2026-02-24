import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';
import type { SmsClient } from '../smsc/types.js';
import { rubitimeWebhookRoutes } from './webhook.js';

const token = 'secret-rubitime-token';

function buildApp(options?: {
  sendMessageImpl?: (chatId: number, text: string) => Promise<unknown>;
  sendSmsImpl?: SmsClient['sendSms'];
  findUserImpl?: (phoneNormalized: string) => Promise<{ chatId: number; telegramId: string; username: string | null } | null>;
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
  });
  return { app, sendMessage, sendSms, insertEvent, upsertRecord, findTelegramUserByPhone };
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

  it('returns 200, writes event/record and notifies user when found', async () => {
    const { app, sendMessage, sendSms, insertEvent, upsertRecord, findTelegramUserByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: {
          id: 'rec-42',
          record: '2025-02-24 14:00',
          name: 'Иван',
          phone: '+79991234567',
          service: 'Стрижка',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(upsertRecord).toHaveBeenCalledTimes(1);
    expect(findTelegramUserByPhone).toHaveBeenCalledWith('+79991234567');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Запись подтверждена'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('rec-42'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('2025-02-24 14:00'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Иван'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('+79991234567'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Стрижка'));
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('returns 200 and uses fallback when user not found', async () => {
    const { app, sendMessage, sendSms } = buildApp({
      findUserImpl: async () => null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: { id: '1', phone: '+79991234567' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(99999, expect.stringContaining('требуется SMS'));
  });
});
