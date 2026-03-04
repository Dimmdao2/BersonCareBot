import { describe, expect, it, vi } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';
import { resolveScript } from './resolver.js';

const rubitimeEventBase: IncomingEvent = {
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
        status: '0',
        comment: '',
      },
    },
  },
};

describe('resolveScript for rubitime webhook', () => {
  it('uses telegram first for status=0 when phone is linked to telegram user', async () => {
    const script = await resolveScript(rubitimeEventBase, {
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
    expect((payload as { message?: { text?: string } }).message?.text).toContain(
      'Вы записаны к Дмитрию на прием',
    );
  });

  it('falls back to smsc for status=4 when no linked telegram user', async () => {
    const canceledEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-remove-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '4',
            comment: '',
          },
        },
      },
    };
    const script = await resolveScript(canceledEvent, {
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
    expect((payload as { message?: { text?: string } }).message?.text).toContain(
      'Отменена ваша запись на прием',
    );
  });

  it('does not create message.send for silent statuses', async () => {
    const silentEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-update-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '3',
            comment: '',
          },
        },
      },
    };
    const script = await resolveScript(silentEvent, {
      resolveRubitimeRecipientContext: vi.fn().mockResolvedValue({
        phoneNormalized: '+79990001122',
        hasTelegramUser: true,
        telegramUser: { chatId: 123, telegramId: '123', username: 'u' },
        isTelegramAdmin: false,
        isAppAdmin: false,
        telegramNotificationsEnabled: true,
      }),
    });
    const kinds = script.steps.map((step) => step.kind);
    expect(kinds).toContain('event.log');
    expect(kinds).toContain('booking.upsert');
    expect(kinds).not.toContain('message.send');
  });

  it('uses moved template for status=7 with comment', async () => {
    const movedEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-update-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '7',
            comment: 'Можно на вечер?',
          },
        },
      },
    };
    const script = await resolveScript(movedEvent, {
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
    const payload = messageStep?.payload as { message?: { text?: string } };
    expect(payload.message?.text).toContain('Запрос на перенос записи получен');
    expect(payload.message?.text).toContain('Можно на вечер?');
  });

  it('uses accepted message for event-create-record regardless of status payload', async () => {
    const createdEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-create-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '6',
            comment: '',
          },
        },
      },
    };
    const script = await resolveScript(createdEvent, {
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
    const payload = messageStep?.payload as { message?: { text?: string } };
    expect(payload.message?.text).toContain('Вы записаны к Дмитрию на прием');
  });

  it('enqueues delayed create retry when event-create-record has no linked telegram user', async () => {
    const createdEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-create-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '0',
            comment: '',
          },
        },
      },
    };
    const script = await resolveScript(createdEvent, {
      resolveRubitimeRecipientContext: vi.fn().mockResolvedValue({
        phoneNormalized: '+79990001122',
        hasTelegramUser: false,
        telegramUser: null,
        isTelegramAdmin: false,
        isAppAdmin: false,
        telegramNotificationsEnabled: true,
      }),
    });
    const enqueueStep = script.steps.find((step) => step.kind === 'rubitime.create_retry.enqueue');
    expect(enqueueStep).toBeDefined();
    const payload = enqueueStep?.payload as {
      phoneNormalized?: string;
      firstTryDelaySeconds?: number;
      maxAttempts?: number;
      messageText?: string;
    };
    expect(payload.phoneNormalized).toBe('+79990001122');
    expect(payload.firstTryDelaySeconds).toBe(60);
    expect(payload.maxAttempts).toBe(2);
    expect(payload.messageText).toContain('Вы записаны к Дмитрию на прием');
    expect(script.steps.some((step) => step.kind === 'message.send')).toBe(false);
  });

  it('uses canceled message for event-remove-record regardless of status payload', async () => {
    const removedEvent: IncomingEvent = {
      ...rubitimeEventBase,
      payload: {
        body: {
          event: 'event-remove-record',
          data: {
            id: 'record-1',
            phone: '+79990001122',
            record: '2026-03-03 15:30',
            status: '1',
            comment: '',
          },
        },
      },
    };
    const script = await resolveScript(removedEvent, {
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
    const payload = messageStep?.payload as { message?: { text?: string } };
    expect(payload.message?.text).toContain('Отменена ваша запись на прием');
  });
});
