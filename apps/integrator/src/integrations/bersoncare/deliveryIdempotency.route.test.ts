import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdempotencyPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { registerBersoncareReminderRulesRoute } from './reminderRulesRoute.js';
import { registerBersoncareSendSmsRoute } from './sendSmsRoute.js';

const secret = 'delivery-idempotency-test-secret';
const apps: FastifyInstance[] = [];

function port(): IdempotencyPort {
  const keys = new Set<string>();
  return {
    tryAcquire: async (key) => (keys.has(key) ? false : (keys.add(key), true)),
    release: async (key) => void keys.delete(key),
  };
}

function headers(raw: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`)
      .digest('base64url'),
  };
}

async function signed(app: FastifyInstance, url: string, body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return app.inject({ method: 'POST', url, headers: headers(raw), payload: raw });
}

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('webapp delivery seams idempotency', () => {
  it('SMS retry dispatches once; a distinct resend key dispatches twice', async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: secret,
      isAuthChannelEnabled: async () => true,
      recordProviderFailure: async () => {},
      idempotencyPort: port(),
    });
    const first = { phone: '+79991234567', code: '123456', idempotencyKey: 'otp:sms:1' };
    expect((await signed(app, '/api/bersoncare/send-sms', first)).json()).toEqual({ ok: true });
    expect((await signed(app, '/api/bersoncare/send-sms', first)).json()).toEqual({
      ok: true,
      status: 'duplicate',
    });
    expect(
      (
        await signed(app, '/api/bersoncare/send-sms', {
          ...first,
          code: '654321',
          idempotencyKey: 'otp:sms:2',
        })
      ).json(),
    ).toEqual({ ok: true });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
  });

  it('reminder outbox retry writes once; a new rule event writes again', async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    const writeDb = vi.fn(async () => undefined);
    await registerBersoncareReminderRulesRoute(app, {
      writePort: { writeDb },
      sharedSecret: secret,
      idempotencyPort: port(),
    });
    const payload = {
      integratorRuleId: 'rule-1',
      integratorUserId: '42',
      category: 'exercise',
      isEnabled: true,
      scheduleType: 'interval_window',
      timezone: 'Europe/Moscow',
      intervalMinutes: 60,
      windowStartMinute: 540,
      windowEndMinute: 600,
      daysMask: '1111111',
      contentMode: 'none',
    };
    const first = {
      eventType: 'reminder.rule.upserted',
      idempotencyKey: 'reminder_rule:1',
      payload,
    };
    expect((await signed(app, '/api/integrator/reminders/rules', first)).json()).toEqual({
      ok: true,
    });
    expect((await signed(app, '/api/integrator/reminders/rules', first)).json()).toEqual({
      ok: true,
      status: 'duplicate',
    });
    expect(
      (
        await signed(app, '/api/integrator/reminders/rules', {
          ...first,
          idempotencyKey: 'reminder_rule:2',
        })
      ).json(),
    ).toEqual({ ok: true });
    expect(writeDb).toHaveBeenCalledTimes(2);
  });
});
