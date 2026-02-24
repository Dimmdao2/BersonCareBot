import Fastify from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RubitimeTelegramApi } from './webhook.js';
import { rubitimeWebhookRoutes } from './webhook.js';

const token = 'secret-rubitime-token';

function buildApp(tgApi: RubitimeTelegramApi) {
  const app = Fastify({ logger: false });
  rubitimeWebhookRoutes(app, {
    tgApi,
    inboxChatId: '12345',
    webhookToken: token,
  });
  return app;
}

describe('POST /webhook/rubitime', () => {
  it('returns 403 if token is missing', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ sendMessage });

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
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ sendMessage });

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
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ sendMessage });

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

  it('returns 200 and calls sendMessage with expected chat_id and text', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ sendMessage });

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
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Rubitime'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('create'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('rec-42'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('2025-02-24 14:00'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Иван'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('+79991234567'));
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Стрижка'));
  });

  it('returns 200 even when sendMessage throws (error is logged, status 200)', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Telegram API error'));
    const app = buildApp({ sendMessage });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      headers: { 'x-rubitime-token': token },
      payload: {
        from: 'rubitime',
        event: 'event-update-record',
        data: { id: '1' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
