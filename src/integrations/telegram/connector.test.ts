import { describe, expect, it } from 'vitest';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';

describe('telegramIncomingToEvent', () => {
  it('maps message update to IncomingEvent', () => {
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 123,
      channelId: '123',
      text: '/start',
      userRow: { id: '1', channel_id: '123' },
      userState: 'idle',
    };

    const event = telegramIncomingToEvent({
      incoming,
      correlationId: 'corr-1',
      eventId: 'evt-1',
    });

    expect(event.type).toBe('message.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-1');
    expect(event.meta.eventId).toBe('evt-1');
    expect(event.payload).toMatchObject({ incoming });
  });

  it('maps callback update to IncomingEvent', () => {
    const incoming: IncomingUpdate = {
      kind: 'callback',
      chatId: 123,
      messageId: 10,
      channelUserId: 123,
      callbackData: 'menu_notifications',
      callbackQueryId: 'cb-1',
    };

    const event = telegramIncomingToEvent({
      incoming,
      correlationId: 'corr-2',
      eventId: 'evt-2',
    });

    expect(event.type).toBe('callback.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-2');
    expect(event.meta.eventId).toBe('evt-2');
    expect(event.payload).toMatchObject({ incoming });
  });
});
