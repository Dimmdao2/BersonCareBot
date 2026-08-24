import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  sendMail: vi.fn(),
  resolveSmtpOutboundConfig: vi.fn(),
}));

vi.mock('./mailer.js', () => ({ sendMail: fakes.sendMail }));
vi.mock('../../config/smtpOutbound.js', () => ({
  resolveSmtpOutboundConfig: fakes.resolveSmtpOutboundConfig,
}));

import { createEmailDeliveryAdapter } from './deliveryAdapter.js';

function authCodeIntent(senderDisplayName: string): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'otp:email:sender-name-test',
      occurredAt: '2026-08-24T00:00:00.000Z',
      source: 'email',
      outboundMessageClass: 'auth_code',
      outboundCapability: 'auth_code',
    },
    payload: {
      recipient: { email: 'recipient@example.test' },
      delivery: { channels: ['email'] },
      authCode: '123456',
      mailProfile: { kind: 'platform', senderDisplayName },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.resolveSmtpOutboundConfig.mockResolvedValue({
    configured: true,
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    user: 'sender@example.test',
    password: 'secret',
    fromAddress: 'sender@example.test',
  });
  fakes.sendMail.mockResolvedValue({ accepted: ['recipient@example.test'], rejected: [] });
});

describe('email auth-code delivery sender identity', () => {
  it('uses the caller-selected name in both message copy and the SMTP From display name', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => ({}) as never });

    await adapter.send(authCodeIntent('Therapysto'));

    expect(fakes.sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subject: 'Код подтверждения Therapysto',
        text: 'Ваш код Therapysto: 123456',
        fromName: 'Therapysto',
      }),
    );
  });
});
