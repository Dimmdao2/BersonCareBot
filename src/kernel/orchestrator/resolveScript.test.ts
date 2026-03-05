import { describe, expect, it } from 'vitest';
import type { DomainContext, IncomingEvent } from '../contracts/index.js';
import { resolveScript } from './resolveScript.js';

describe('resolveScript (v3)', () => {
  it('returns ScriptStep[] for rubitime event', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        source: 'rubitime',
        occurredAt: '2026-03-05T12:00:00.000Z',
      },
      payload: {
        body: {
          event: 'event-update-record',
          data: {
            id: 'rec-1',
            phone: '+79990001122',
            record: '2026-03-05 15:30',
            status: '0',
            comment: '',
          },
        },
      },
    };

    const context: DomainContext = {
      event,
      nowIso: '2026-03-05T12:00:00.000Z',
      values: {
        rubitimeRecipientContext: {
          phoneNormalized: '+79990001122',
          hasTelegramUser: true,
          telegramUser: { chatId: 123, telegramId: '123', username: 'u' },
          isTelegramAdmin: false,
          isAppAdmin: false,
          telegramNotificationsEnabled: true,
        },
      },
    };

    const steps = await resolveScript({ event, context });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]?.action).toBe('event.log');
  });
});
