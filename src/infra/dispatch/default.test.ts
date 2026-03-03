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

  it('falls back to smsc after telegram failure', async () => {
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

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(smsClient.sendSms).toHaveBeenCalledTimes(1);
    expect(writeDb).toHaveBeenCalledTimes(2);
    const [firstLog, secondLog] = writeDb.mock.calls.map((call) => call[0]);
    expect(firstLog?.params?.status).toBe('failed');
    expect(secondLog?.params?.status).toBe('success');
  });

  it('sends debug delivery notifications to admin when enabled', async () => {
    const smsClient = { sendSms: vi.fn().mockResolvedValue(undefined) };
    const dispatchPort = createDefaultDispatchPort({
      smsClient,
      debugForwardAllEvents: true,
      debugAdminChatId: 777,
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
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const params = sendMessageMock.mock.calls[0]?.[0] as { chat_id?: number; text?: string };
    expect(params.chat_id).toBe(777);
    expect(params.text).toContain('DEBUG DELIVERY');
    expect(params.text).toContain('channel_success');
    expect(smsClient.sendSms).toHaveBeenCalledTimes(1);
  });
});
