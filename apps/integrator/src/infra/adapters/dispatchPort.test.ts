import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from './dispatchPort.js';

const sendPrimaryMock = vi.fn().mockResolvedValue(undefined);
const sendSecondaryMock = vi.fn().mockResolvedValue(undefined);
const channelPrimary = 'channel-a';
const channelSecondary = 'channel-b';

function readChannel(intent: OutgoingIntent): string | null {
  const payload = intent.payload as { delivery?: { channels?: unknown } };
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return null;
}

function buildAdapters(): DeliveryAdapter[] {
  return [
    {
      canHandle: (intent) => intent.type === 'message.send' && readChannel(intent) === channelPrimary,
      send: sendPrimaryMock,
    },
    {
      canHandle: (intent) => intent.type === 'message.send' && readChannel(intent) === channelSecondary,
      send: sendSecondaryMock,
    },
  ];
}

describe('createDefaultDispatchPort', () => {
  beforeEach(() => {
    sendPrimaryMock.mockReset();
    sendSecondaryMock.mockReset();
  });

  it('dispatches primary adapter when first channel matches', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-1', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { chatId: 1 },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(sendSecondaryMock).not.toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('does not fallback after primary failure', async () => {
    sendPrimaryMock.mockRejectedValueOnce(new Error('adapter down'));
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-2', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { chatId: 1, phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary, channelSecondary], maxAttempts: 1 },
      },
    };

    await expect(dispatchPort.dispatchOutgoing(intent)).rejects.toThrow('adapter down');
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(sendSecondaryMock).toHaveBeenCalledTimes(0);
    expect(writeDb).toHaveBeenCalledTimes(0);
  });

  it('sends secondary when first channel is secondary', async () => {
    const dispatchPort = createDefaultDispatchPort({
      adapters: buildAdapters(),
    });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-3', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelSecondary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(0);
    expect(sendSecondaryMock).toHaveBeenCalledTimes(1);
  });

  it('does not auto-resolve phone recipient through readPort', async () => {
    const readDb = vi.fn().mockResolvedValue({ chatId: 77 });
    const dispatchPort = createDefaultDispatchPort({
      adapters: buildAdapters(),
      readPort: { readDb },
    });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-3b', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(readDb).not.toHaveBeenCalled();
  });

  it('dispatches non-message intent by intent source', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({
      adapters: [{
        canHandle: (intent) => intent.type === 'callback.answer' && intent.meta.source === 'telegram',
        send,
      }],
    });

    await dispatchPort.dispatchOutgoing({
      type: 'callback.answer',
      meta: { eventId: 'evt-4', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
      payload: { callbackQueryId: 'cb-1' },
    });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('redacts OTP payload in delivery logs', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'otp:telegram:test', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram', correlationId: 'otp:123:654321' },
      payload: {
        recipient: { chatId: '123' },
        message: { text: 'Код для входа в BersonCare: 654321' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);

    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delivery.attempt.log',
        params: expect.objectContaining({
          correlationId: null,
          payload: expect.objectContaining({ kind: 'otp_redacted' }),
        }),
      }),
    );
  });
});
