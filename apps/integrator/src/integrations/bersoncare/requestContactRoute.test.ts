import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { registerBersoncareRequestContactRoute } from './requestContactRoute.js';

const TEST_SECRET = 'test-secret-request-contact';

/** `user.upsert` в writePort идёт через `db.tx`; для route-тестов достаточно прокинуть тот же `query`. */
function dbWithTx(query: DbPort['query']): DbPort {
  const tx = vi.fn(async <T>(fn: (d: DbPort) => Promise<T>) => fn({ query, tx } as DbPort));
  return { query, tx } as DbPort;
}

function sign(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

async function buildApp(deps: Parameters<typeof registerBersoncareRequestContactRoute>[1]) {
  const app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
    (req as typeof req & { rawBody?: string }).rawBody = raw;
    try {
      done(null, JSON.parse(raw) as unknown);
    } catch (e) {
      done(e as Error, undefined);
    }
  });
  await registerBersoncareRequestContactRoute(app, deps);
  return app;
}

describe('POST /api/bersoncare/request-contact', () => {
  it('returns 401 for bad signature', async () => {
    const app = await buildApp({
      dispatchPort: { dispatchOutgoing: vi.fn() },
      sharedSecret: TEST_SECRET,
      db: { query: vi.fn() } as never,
    });
    const rawBody = JSON.stringify({
      channel: 'telegram',
      recipientId: '123',
      idempotencyKey: 'k1',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/request-contact',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad',
      },
      body: rawBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('dispatches telegram message with reply keyboard and sets state', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const app = await buildApp({
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
      db: dbWithTx(query),
    });
    const bodyObj = {
      channel: 'telegram' as const,
      recipientId: '999',
      idempotencyKey: 'idem-1',
    };
    const rawBody = JSON.stringify(bodyObj);
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/request-contact',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': ts,
        'x-bersoncare-signature': sign(ts, rawBody, TEST_SECRET),
      },
      body: rawBody,
    });
    expect(res.statusCode).toBe(200);
    expect(query).toHaveBeenCalled();
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    const firstCall = dispatchOutgoing.mock.calls[0];
    expect(firstCall).toBeDefined();
    const intent = firstCall![0] as {
      type: string;
      payload: {
        replyMarkup: { keyboard?: Array<Array<{ request_contact?: boolean }>> };
        delivery: { channels: string[] };
      };
    };
    expect(intent.type).toBe('message.send');
    expect(intent.payload.delivery.channels).toEqual(['telegram']);
    const row0 = intent.payload.replyMarkup.keyboard?.[0];
    expect(row0?.[0]).toMatchObject({ request_contact: true });
    await app.close();
  });

  it('dispatches max message with inline_keyboard request_contact and does not set telegram state', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn();
    const app = await buildApp({
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
      db: { query } as never,
    });
    const bodyObj = {
      channel: 'max' as const,
      recipientId: '555',
      idempotencyKey: 'idem-max-1',
    };
    const rawBody = JSON.stringify(bodyObj);
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/request-contact',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': ts,
        'x-bersoncare-signature': sign(ts, rawBody, TEST_SECRET),
      },
      body: rawBody,
    });
    expect(res.statusCode).toBe(200);
    expect(query).not.toHaveBeenCalled();
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    const firstCall = dispatchOutgoing.mock.calls[0];
    expect(firstCall).toBeDefined();
    const intent = firstCall![0] as {
      type: string;
      payload: {
        replyMarkup: { inline_keyboard?: Array<Array<{ request_contact?: boolean; text?: string }>> };
        delivery: { channels: string[] };
      };
    };
    expect(intent.type).toBe('message.send');
    expect(intent.payload.delivery.channels).toEqual(['max']);
    const row0 = intent.payload.replyMarkup.inline_keyboard?.[0];
    expect(row0?.[0]).toMatchObject({ request_contact: true, text: expect.any(String) });
    await app.close();
  });

  it('deduplicates by idempotencyKey', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = await buildApp({
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
      db: dbWithTx(query),
    });
    const bodyObj = {
      channel: 'telegram' as const,
      recipientId: '1',
      idempotencyKey: 'same-key',
    };
    const rawBody = JSON.stringify(bodyObj);
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      'content-type': 'application/json',
      'x-bersoncare-timestamp': ts,
      'x-bersoncare-signature': sign(ts, rawBody, TEST_SECRET),
    };
    const r1 = await app.inject({ method: 'POST', url: '/api/bersoncare/request-contact', headers, body: rawBody });
    const r2 = await app.inject({ method: 'POST', url: '/api/bersoncare/request-contact', headers, body: rawBody });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const j2 = JSON.parse(r2.body) as { status?: string };
    expect(j2.status).toBe('duplicate');
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
