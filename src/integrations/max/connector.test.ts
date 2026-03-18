import { describe, expect, it } from 'vitest';
import { maxEventToIncoming, maxIncomingToEvent } from './connector.js';

describe('max connector', () => {
  it('wraps message incoming in IncomingEvent with source max', () => {
    const incoming = {
      kind: 'message' as const,
      chatId: 100,
      channelId: '100',
      text: 'Hi',
      action: '',
      userRow: null,
      userState: '',
    };
    const event = maxIncomingToEvent({
      incoming,
      correlationId: 'corr-1',
      eventId: 'evt-1',
    });
    expect(event.type).toBe('message.received');
    expect(event.meta.source).toBe('max');
    expect(event.meta.userId).toBe('100');
  });

  it('wraps callback incoming in IncomingEvent with dedup by callbackId', () => {
    const incoming = {
      kind: 'callback' as const,
      chatId: 101,
      messageId: 5,
      channelUserId: 101,
      callbackData: 'menu.back',
      callbackQueryId: 'cb-1',
    };
    const event = maxIncomingToEvent({
      incoming,
      correlationId: 'c2',
      eventId: 'e2',
    });
    expect(event.type).toBe('callback.received');
    expect(event.meta.source).toBe('max');
    expect(event.meta.userId).toBe('101');
    expect(event.meta.dedupFingerprint).toEqual({ callbackId: 'cb-1' });
  });

  it('extracts incoming from event', () => {
    const incoming = {
      kind: 'message' as const,
      chatId: 102,
      channelId: '102',
      text: 'x',
      action: '',
      userRow: null,
      userState: '',
    };
    const event = maxIncomingToEvent({ incoming, correlationId: 'c', eventId: 'e' });
    const back = maxEventToIncoming(event);
    expect(back).toEqual(incoming);
  });

  it('returns null for non-max event', () => {
    const event = {
      type: 'message.received' as const,
      meta: { eventId: 'e', occurredAt: '', source: 'telegram' },
      payload: { incoming: {} },
    };
    expect(maxEventToIncoming(event)).toBeNull();
  });
});
