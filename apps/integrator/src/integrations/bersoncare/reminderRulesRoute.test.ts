import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareReminderRulesRoute } from './reminderRulesRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function sign(timestamp: string, rawBody: string, secret = TEST_SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function makeHeaders(rawBody: string, secret = TEST_SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': sign(timestamp, rawBody, secret),
  };
}

describe('POST /api/integrator/reminders/rules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts valid signed upsert payload', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const app = Fastify();
    await registerBersoncareReminderRulesRoute(app, {
      writePort: { writeDb },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({
      eventType: 'reminder.rule.upserted',
      idempotencyKey: 'rule_rule-abc_123',
      payload: {
        integratorRuleId: 'rule-abc',
        integratorUserId: '42',
        category: 'lfk',
        isEnabled: true,
        scheduleType: 'interval_window',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 480,
        windowEndMinute: 1200,
        daysMask: '1111100',
        contentMode: 'none',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/reminders/rules',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(writeDb).toHaveBeenCalledTimes(1);
    expect(writeDb).toHaveBeenCalledWith({
      type: 'reminders.rule.upsert',
      params: {
        id: 'rule-abc',
        userId: '42',
        category: 'lfk',
        isEnabled: true,
        scheduleType: 'interval_window',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 480,
        windowEndMinute: 1200,
        daysMask: '1111100',
        contentMode: 'none',
        customTitle: null,
        customText: null,
        deepLink: null,
        linkedObjectId: null,
        linkedObjectType: null,
        reminderIntent: null,
        scheduleData: undefined,
      },
    });
  });

  it('returns 401 for invalid signature', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const app = Fastify();
    await registerBersoncareReminderRulesRoute(app, {
      writePort: { writeDb },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({
      eventType: 'reminder.rule.upserted',
      payload: {
        integratorRuleId: 'rule-abc',
        integratorUserId: '42',
        category: 'lfk',
        isEnabled: true,
        scheduleType: 'interval_window',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 480,
        windowEndMinute: 1200,
        daysMask: '1111100',
        contentMode: 'none',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/reminders/rules',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad-signature',
      },
      body,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'invalid_signature' });
    expect(writeDb).not.toHaveBeenCalled();
  });
});
