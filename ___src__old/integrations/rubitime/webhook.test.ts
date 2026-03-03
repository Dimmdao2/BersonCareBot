import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';
import { rubitimeWebhookRoutes } from './webhook.js';

const token = 'secret-rubitime-token';

function buildApp(options?: {
  dispatchMessageByPhoneImpl?: (input: {
    phoneNormalized: string;
    messageText: string;
    smsFallbackText: string;
  }) => Promise<void>;
}) {
  const dispatchMessageByPhone = vi.fn(options?.dispatchMessageByPhoneImpl ?? (async () => undefined));
  const insertEvent = vi.fn(async () => undefined);
  const upsertRecord = vi.fn(async () => undefined);

  const app = Fastify({ logger: false });
  rubitimeWebhookRoutes(app, {
    insertEvent,
    upsertRecord,
    dispatchMessageByPhone,
    webhookToken: token,
  });
  return { app, dispatchMessageByPhone, insertEvent, upsertRecord };
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
      status: 0,
      status_title: 'Записан',
    },
  };
}

describe('POST /webhook/rubitime/:token', () => {
  it('returns 404 if token path segment is missing', async () => {
    const { app, dispatchMessageByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime',
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: { id: '1', record: '2025-01-01 10:00' },
      },
    });

    expect(res.statusCode).toBe(404);
    expect(dispatchMessageByPhone).not.toHaveBeenCalled();
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
    const { app, dispatchMessageByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime/wrong-token',
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: { id: '1' },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false });
    expect(dispatchMessageByPhone).not.toHaveBeenCalled();
  });

  it('returns 400 if body does not pass schema', async () => {
    const { app, dispatchMessageByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload: {
        from: 'rubitime',
        event: 'invalid-event',
        data: {},
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: 'Invalid webhook body' });
    expect(dispatchMessageByPhone).not.toHaveBeenCalled();
  });

  it('CREATE => writes event/record and dispatches message payload', async () => {
    const { app, dispatchMessageByPhone, insertEvent, upsertRecord } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload: basePayload('event-create-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(upsertRecord).toHaveBeenCalledTimes(1);
    expect(dispatchMessageByPhone).toHaveBeenCalledTimes(1);
    expect(dispatchMessageByPhone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phoneNormalized: '+79991234567',
        messageText: expect.stringContaining('Иван, вы успешно записались на прием к Дмитрию Берсону'),
        smsFallbackText: 'Требуется подтверждение записи',
      }),
    );
    expect(dispatchMessageByPhone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageText: expect.stringContaining('Дата и время: 24.02.2025 в 14:00'),
      }),
    );
  });

  it('CANCEL => dispatches cancel text and cancel fallback sms text', async () => {
    const { app, dispatchMessageByPhone } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload: basePayload('event-remove-record'),
    });

    expect(res.statusCode).toBe(200);
    expect(dispatchMessageByPhone).toHaveBeenCalledTimes(1);
    expect(dispatchMessageByPhone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phoneNormalized: '+79991234567',
        messageText: expect.stringContaining('Отменена ваша запись к Дмитрию на 24.02.2025 в 14:00'),
        smsFallbackText: 'Запись отменена',
      }),
    );
  });

  it('UPDATE with canceled status dispatches cancel-like text', async () => {
    const { app, dispatchMessageByPhone } = buildApp();
    const payload = basePayload('event-update-record');
    payload.data.status = 4;
    payload.data.status_title = 'Отменен';

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(dispatchMessageByPhone).toHaveBeenCalledTimes(1);
    expect(dispatchMessageByPhone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageText: expect.stringContaining('Отменена ваша запись к Дмитрию на 24.02.2025 в 14:00'),
      }),
    );
  });

  it('payload without data.id skips booking upsert', async () => {
    const { app, insertEvent, upsertRecord } = buildApp();
    const payload = basePayload('event-create-record');
    delete (payload.data as Record<string, unknown>).id;

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${token}`,
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(upsertRecord).not.toHaveBeenCalled();
  });
});
