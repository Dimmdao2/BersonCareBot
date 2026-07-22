import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { registerOperatorAlertRelayRoute } from './operatorAlertRelayRoute.js';

const SECRET = 'test-shared-secret-16chars';
const incident = '11111111-1111-4111-8111-111111111111';

async function build(ready = true) {
  const app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const raw = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
    (request as typeof request & { rawBody?: string }).rawBody = raw;
    done(null, JSON.parse(raw) as unknown);
  });
  const dispatchPort: DispatchPort = { dispatchOutgoing: vi.fn(async () => ({})) };
  await registerOperatorAlertRelayRoute(app, {
    dispatchPort,
    sharedSecret: SECRET,
    isSmsProviderReady: vi.fn(async () => ready),
  });
  return { app, dispatchPort };
}

function requestBody(phase: 'initial' | 'one_hour_repeat', id = incident) {
  const messageId = `operator-alert:incident:${id}:phase:${phase}:telegram:4242`;
  return {
    messageId, channel: 'telegram', recipient: '4242', text: 'alert',
    idempotencyKey: `global:${messageId}:telegram:4242`,
  };
}

function headers(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('base64url'),
  };
}

describe('POST /api/bersoncare/operator-alert-relay', () => {
  it('dedups the same phase for 24h but accepts T+1h and a reopened incident', async () => {
    const { app, dispatchPort } = await build();
    const send = async (body: object) => {
      const raw = JSON.stringify(body);
      return app.inject({ method: 'POST', url: '/api/bersoncare/operator-alert-relay', headers: headers(raw), body: raw });
    };
    expect(JSON.parse((await send(requestBody('initial'))).body).status).toBe('accepted');
    expect(JSON.parse((await send(requestBody('initial'))).body).status).toBe('duplicate');
    expect(JSON.parse((await send(requestBody('one_hour_repeat'))).body).status).toBe('accepted');
    expect(JSON.parse((await send(requestBody('initial', '22222222-2222-4222-8222-222222222222'))).body).status).toBe('accepted');
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(3);
    expect(vi.mocked(dispatchPort.dispatchOutgoing).mock.calls[0]![0].meta).toMatchObject({
      outboundMessageClass: 'operator_security', outboundCapability: 'operator_alert',
    });
  });

  it('skips unready SMS without blocking a messenger request', async () => {
    const { app, dispatchPort } = await build(false);
    const sms = { ...requestBody('initial'), channel: 'sms', recipient: '+79990001122' };
    const smsRaw = JSON.stringify(sms);
    const smsResponse = await app.inject({ method: 'POST', url: '/api/bersoncare/operator-alert-relay', headers: headers(smsRaw), body: smsRaw });
    expect(JSON.parse(smsResponse.body).status).toBe('skipped');
    const tg = requestBody('initial', '33333333-3333-4333-8333-333333333333');
    const tgRaw = JSON.stringify(tg);
    expect((await app.inject({ method: 'POST', url: '/api/bersoncare/operator-alert-relay', headers: headers(tgRaw), body: tgRaw })).statusCode).toBe(200);
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });
});
