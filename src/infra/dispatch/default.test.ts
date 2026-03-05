import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/events.js';
import { createDefaultDispatchPort } from './default.js';

const sendMessageMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../integrations/telegram/client.js', () => ({
  createMessagingPort: () => ({ sendMessage: sendMessageMock }),
}));

describe('createDefaultDispatchPort', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
  });

  it('dispatches telegram when payload has chatId', async () => {
    const smsClient = { sendSms: vi.fn().mockResolvedValue(undefined) };
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ smsClient, writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-1', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 1 },
        message: { text: 'hi' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(smsClient.sendSms).not.toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('does not fallback to smsc after telegram failure', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('telegram down'));
    const smsClient = { sendSms: vi.fn().mockResolvedValue(undefined) };
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ smsClient, writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-2', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 1, phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: ['telegram', 'smsc'], maxAttempts: 1 },
      },
    };

    await expect(dispatchPort.dispatchOutgoing(intent)).rejects.toThrow('telegram down');
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(smsClient.sendSms).toHaveBeenCalledTimes(0);
    expect(writeDb).toHaveBeenCalledTimes(0);
  });

  it('sends smsc when first channel is smsc', async () => {
    const smsClient = { sendSms: vi.fn().mockResolvedValue(undefined) };
    const dispatchPort = createDefaultDispatchPort({
      smsClient,
    });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-3', occurredAt: '2026-03-03T00:00:00.000Z', source: 'rubitime' },
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendMessageMock).toHaveBeenCalledTimes(0);
    expect(smsClient.sendSms).toHaveBeenCalledTimes(1);
  });
});
