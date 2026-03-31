import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendEmailRoute } from '../bersoncare/sendEmailRoute.js';
import * as mailer from '../email/mailer.js';
import * as rubitimeClient from './client.js';
import { registerRubitimeRecordM2mRoutes } from './recordM2mRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function sign(timestamp: string, rawBody: string): string {
  return createHmac('sha256', TEST_SECRET).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function makeHeaders(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': sign(timestamp, rawBody),
  };
}

async function buildApp() {
  const app = Fastify();
  const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true);
  vi.spyOn(mailer, 'sendMail').mockResolvedValue({ accepted: [], rejected: [], messageId: 'x' });
  await registerBersoncareSendEmailRoute(app, { sharedSecret: TEST_SECRET });
  await registerRubitimeRecordM2mRoutes(app, { sharedSecret: TEST_SECRET, dispatchPort: { dispatchOutgoing } });
  return app;
}

describe('Rubitime record M2M routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('update-record returns 200 when Rubitime client succeeds', async () => {
    const spy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord').mockResolvedValue({ id: 50 });
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '50', patch: { status: 0 } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: { id: 50 } });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: '50', data: { status: 0 } }),
    );
  });

  it('remove-record returns 200 when Rubitime client succeeds', async () => {
    const spy = vi.spyOn(rubitimeClient, 'removeRubitimeRecord').mockResolvedValue({});
    const app = await buildApp();
    const body = JSON.stringify({ recordId: 99 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/remove-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: {} });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ recordId: '99' }));
  });

  it('returns 401 when signature invalid', async () => {
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '1', patch: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad',
      },
      body,
    });
    expect(res.statusCode).toBe(401);
  });
});
