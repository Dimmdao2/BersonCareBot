import { describe, expect, it, vi } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';
import { resolveScript } from './resolver.js';

const rubitimeEvent: IncomingEvent = {
  type: 'webhook.received',
  meta: {
    eventId: 'incoming-test-1',
    source: 'rubitime',
    occurredAt: '2026-03-03T00:00:00.000Z',
    correlationId: 'corr-1',
  },
  payload: {
    body: {
      event: 'event-update-record',
      data: {
        id: 'record-1',
        phone: '+79990001122',
        record: '2026-03-03 15:30',
      },
    },
  },
};

describe('resolveScript for rubitime webhook', () => {
  it('uses telegram first when phone is linked to telegram user', async () => {
    const script = await resolveScript(rubitimeEvent, {
      resolveRubitimeRecipientContext: vi.fn().mockResolvedValue({
        phoneNormalized: '+79990001122',
        hasTelegramUser: true,
        telegramUser: { chatId: 123, telegramId: '123', username: 'u' },
        isTelegramAdmin: false,
        isAppAdmin: false,
        telegramNotificationsEnabled: true,
      }),
    });

    const messageStep = script.steps.find((step) => step.kind === 'message.send');
    const payload = messageStep?.payload as {
      recipient?: { phoneNormalized?: string; chatId?: number };
      delivery?: { channels?: string[] };
    };

    expect(payload.recipient?.phoneNormalized).toBe('+79990001122');
    expect(payload.recipient?.chatId).toBe(123);
    expect(payload.delivery?.channels).toEqual(['telegram', 'smsc']);
  });

  it('falls back to smsc when no linked telegram user', async () => {
    const script = await resolveScript(rubitimeEvent, {
      resolveRubitimeRecipientContext: vi.fn().mockResolvedValue({
        phoneNormalized: '+79990001122',
        hasTelegramUser: false,
        telegramUser: null,
        isTelegramAdmin: false,
        isAppAdmin: false,
        telegramNotificationsEnabled: true,
      }),
    });

    const messageStep = script.steps.find((step) => step.kind === 'message.send');
    const payload = messageStep?.payload as {
      recipient?: { phoneNormalized?: string; chatId?: number };
      delivery?: { channels?: string[] };
    };

    expect(payload.recipient?.phoneNormalized).toBe('+79990001122');
    expect(payload.recipient?.chatId).toBeUndefined();
    expect(payload.delivery?.channels).toEqual(['smsc']);
  });
});
