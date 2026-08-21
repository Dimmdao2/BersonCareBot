import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../kernel/contracts/index.js';

const mocks = vi.hoisted(() => ({
  createMessagingPort: vi.fn(),
  telegramSendMessage: vi.fn(),
  sendMaxMessage: vi.fn(),
  sendVkMessage: vi.fn(),
  answerVkMessageEvent: vi.fn(),
  sendMail: vi.fn(),
  resolveSmtpOutboundConfig: vi.fn(),
}));

vi.mock('./telegram/client.js', () => ({
  createMessagingPort: mocks.createMessagingPort,
}));
vi.mock('./max/client.js', () => ({
  MaxSendError: class MaxSendError extends Error {},
  sendMaxMessage: mocks.sendMaxMessage,
}));
vi.mock('./max/runtimeConfig.js', () => ({
  getMaxApiKey: async () => 'platform-max-key',
  getMaxBaseUrl: () => '',
}));
vi.mock('./vk/client.js', () => ({
  VkApiError: class VkApiError extends Error {
    constructor(
      readonly code: number | null,
      readonly apiMessage: string,
    ) {
      super(apiMessage);
    }
  },
  sendVkMessage: mocks.sendVkMessage,
  answerVkMessageEvent: mocks.answerVkMessageEvent,
}));
vi.mock('../infra/adapters/integrationRuntimeConfig.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../infra/adapters/integrationRuntimeConfig.js')>();
  return {
    ...actual,
    getVkRuntimeConfig: async () => ({
      enabled: true,
      communityAccessToken: 'platform-vk-token',
      callbackSecret: 'callback-secret',
      confirmationToken: 'confirmation-token',
    }),
  };
});
vi.mock('./email/mailer.js', () => ({ sendMail: mocks.sendMail }));
vi.mock('../config/smtpOutbound.js', () => ({
  resolveSmtpOutboundConfig: mocks.resolveSmtpOutboundConfig,
}));

import { createTelegramDeliveryAdapter } from './telegram/deliveryAdapter.js';
import { createMaxDeliveryAdapter } from './max/deliveryAdapter.js';
import { createVkDeliveryAdapter } from './vk/deliveryAdapter.js';
import { VkApiError } from './vk/client.js';
import { createSmscDeliveryAdapter } from './smsc/deliveryAdapter.js';
import { createEmailDeliveryAdapter } from './email/deliveryAdapter.js';

function intent(
  channel: 'telegram' | 'max' | 'vk' | 'smsc' | 'email',
  payload: Record<string, unknown>,
) {
  return {
    type: 'message.send',
    meta: {
      eventId: `adapter:${channel}`,
      occurredAt: '2026-08-02T00:00:00.000Z',
      source: channel,
    },
    payload: {
      ...payload,
      message: { text: 'hello' },
      delivery: {
        channels: [channel],
        ...(payload.delivery as Record<string, unknown> | undefined),
      },
    },
  } as OutgoingIntent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.telegramSendMessage.mockResolvedValue({ message_id: 1 });
  mocks.createMessagingPort.mockReturnValue({
    sendMessage: mocks.telegramSendMessage,
    sendPhoto: vi.fn(),
    copyMessage: vi.fn(),
    editMessageText: vi.fn(),
    editMessageReplyMarkup: vi.fn(),
    deleteMessage: vi.fn(),
    answerCallbackQuery: vi.fn(),
  });
  mocks.sendMaxMessage.mockResolvedValue({ body: { mid: 'max-message-1' } });
  mocks.sendVkMessage.mockResolvedValue(77);
  mocks.answerVkMessageEvent.mockResolvedValue(1);
  mocks.sendMail.mockResolvedValue({
    accepted: ['patient@example.test'],
    rejected: [],
    messageId: 'smtp-message-1',
  });
  mocks.resolveSmtpOutboundConfig.mockResolvedValue({
    configured: true,
    smtpHost: 'smtp.platform.test',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'platform',
    smtpPass: 'platform-secret',
    fromAddress: 'platform@example.test',
  });
});

describe('clinic credential handoff to provider adapters', () => {
  it('constructs the Telegram client with the clinic bot token', async () => {
    await createTelegramDeliveryAdapter().send(
      intent('telegram', {
        recipient: { chatId: 123 },
        delivery: {
          clinicCredential: { channel: 'telegram', botToken: 'clinic-telegram-token' },
        },
      }),
    );

    expect(mocks.createMessagingPort).toHaveBeenCalledWith('clinic-telegram-token');
    expect(mocks.telegramSendMessage).toHaveBeenCalledOnce();
  });

  it('sends MAX with the clinic API key', async () => {
    await createMaxDeliveryAdapter().send(
      intent('max', {
        recipient: { userId: 456 },
        delivery: { clinicCredential: { channel: 'max', apiKey: 'clinic-max-key' } },
      }),
    );

    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      { apiKey: 'clinic-max-key' },
      expect.objectContaining({ userId: 456, text: 'hello' }),
    );
  });

  it('sends VK with the exact clinic community token', async () => {
    await createVkDeliveryAdapter().send(
      intent('vk', {
        recipient: { userId: 789 },
        delivery: {
          clinicCredential: { channel: 'vk', accessToken: 'clinic-vk-token' },
        },
      }),
    );

    expect(mocks.sendVkMessage).toHaveBeenCalledWith(
      { accessToken: 'clinic-vk-token' },
      expect.objectContaining({ userId: 789, text: 'hello', eventId: 'adapter:vk' }),
      expect.any(Function),
    );
  });

  it('normalizes VK recipient denial for the common delivery journal classification', async () => {
    mocks.sendVkMessage.mockRejectedValueOnce(new VkApiError(901, 'recipient denied'));

    await expect(
      createVkDeliveryAdapter().send(intent('vk', { recipient: { userId: 789 } })),
    ).rejects.toMatchObject({
      name: 'RecipientBlockedBotError',
      channel: 'vk',
    });
  });

  it('uses a clinic SMS client instead of the platform SMS client', async () => {
    const platformSend = vi.fn(async () => ({ ok: true as const }));
    const clinicSend = vi.fn(async () => ({ ok: true as const }));
    const createClinicSmsClient = vi.fn(() => ({ sendSms: clinicSend }));
    await createSmscDeliveryAdapter({
      smsClient: { sendSms: platformSend },
      createClinicSmsClient,
    }).send(
      intent('smsc', {
        recipient: { phoneNormalized: '+79991234567' },
        delivery: { clinicCredential: { channel: 'smsc', apiKey: 'clinic-smsc-key' } },
      }),
    );

    expect(createClinicSmsClient).toHaveBeenCalledWith('clinic-smsc-key');
    expect(clinicSend).toHaveBeenCalledOnce();
    expect(platformSend).not.toHaveBeenCalled();
  });

  it('passes the clinic SMTP envelope to the mailer without resolving platform SMTP', async () => {
    const clinicSmtp = {
      configured: true,
      smtpHost: 'smtp.clinic.test',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'clinic',
      smtpPass: 'clinic-secret',
      fromAddress: 'clinic@example.test',
    };
    await createEmailDeliveryAdapter({ getDb: () => ({}) as never }).send(
      intent('email', {
        recipient: { email: 'patient@example.test' },
        subject: 'Subject',
        delivery: { clinicCredential: { channel: 'email', smtp: clinicSmtp } },
      }),
    );

    expect(mocks.resolveSmtpOutboundConfig).not.toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledWith(
      clinicSmtp,
      expect.objectContaining({ to: 'patient@example.test', subject: 'Subject', text: 'hello' }),
    );
  });

  it('fails when SMTP rejects the intended recipient', async () => {
    mocks.sendMail.mockResolvedValueOnce({
      accepted: [],
      rejected: ['patient@example.test'],
      messageId: 'smtp-message-rejected',
    });

    await expect(
      createEmailDeliveryAdapter({ getDb: () => ({}) as never }).send(
        intent('email', { recipient: { email: 'patient@example.test' } }),
      ),
    ).rejects.toThrow('EMAIL_SMTP_RECIPIENT_REJECTED');
  });

  it('fails when SMTP reports neither acceptance nor rejection', async () => {
    mocks.sendMail.mockResolvedValueOnce({ accepted: [], rejected: [] });

    await expect(
      createEmailDeliveryAdapter({ getDb: () => ({}) as never }).send(
        intent('email', { recipient: { email: 'patient@example.test' } }),
      ),
    ).rejects.toThrow('EMAIL_SMTP_RECIPIENT_NOT_ACCEPTED');
  });
});
