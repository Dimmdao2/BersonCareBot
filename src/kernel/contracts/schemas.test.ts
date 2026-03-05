import { describe, expect, it } from 'vitest';
import {
  actionResultSchema,
  actionSchema,
  deliveryJobSchema,
  domainContextSchema,
  scriptStepSchema,
} from './index.js';

describe('kernel contracts schemas', () => {
  it('validates DomainContext', () => {
    const parsed = domainContextSchema.parse({
      event: {
        type: 'webhook.received',
        meta: {
          eventId: 'evt-1',
          occurredAt: '2026-03-05T10:00:00.000Z',
          source: 'source-a',
        },
        payload: { body: { event: 'event-create-record' } },
      },
      nowIso: '2026-03-05T10:00:00.000Z',
      values: { foo: 'bar' },
      base: {
        actor: { isAdmin: false },
        identityLinks: [],
      },
      user: {
        channelId: '123',
        phoneNormalized: '+79990001122',
        isAdmin: false,
        channels: ['primary', 'secondary'],
      },
    });

    expect(parsed.user?.channelId).toBe('123');
  });

  it('validates ScriptStep and Action', () => {
    const step = scriptStepSchema.parse({
      id: 'step-1',
      action: 'message.send',
      mode: 'async',
      params: { text: 'hello' },
    });

    const action = actionSchema.parse({
      id: 'act-1',
      type: step.action,
      mode: step.mode,
      params: step.params,
    });

    expect(action.type).toBe('message.send');
  });

  it('validates DeliveryJob and rejects attempts overflow', () => {
    const ok = deliveryJobSchema.parse({
      id: 'job-1',
      kind: 'delivery.retry',
      runAt: '2026-03-05T10:01:00.000Z',
      attempts: 1,
      maxAttempts: 3,
      payload: { intentId: 'intent-1' },
    });
    expect(ok.kind).toBe('delivery.retry');

    const bad = deliveryJobSchema.safeParse({
      id: 'job-2',
      kind: 'delivery.retry',
      runAt: '2026-03-05T10:01:00.000Z',
      attempts: 4,
      maxAttempts: 3,
      payload: { intentId: 'intent-2' },
    });
    expect(bad.success).toBe(false);
  });

  it('validates ActionResult with intents and jobs', () => {
    const parsed = actionResultSchema.parse({
      actionId: 'act-1',
      status: 'queued',
      intents: [
        {
          type: 'message.send',
          meta: {
            eventId: 'out-1',
            occurredAt: '2026-03-05T10:00:00.000Z',
            source: 'domain',
          },
          payload: {
            recipient: { chatId: 1 },
            message: { text: 'hello' },
            delivery: { channels: ['primary'], maxAttempts: 1 },
          },
        },
      ],
      jobs: [
        {
          id: 'job-1',
          kind: 'delivery.retry',
          runAt: '2026-03-05T10:01:00.000Z',
          attempts: 0,
          maxAttempts: 3,
          payload: { intentId: 'out-1' },
        },
      ],
    });

    expect(parsed.status).toBe('queued');
    expect(parsed.jobs?.length).toBe(1);
  });
});
