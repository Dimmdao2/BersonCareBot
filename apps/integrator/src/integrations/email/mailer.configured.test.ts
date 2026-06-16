import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  emailConfig: {
    configured: true,
    fromAddress: 'noreply@test.example',
    smtpHost: 'smtp.test.example',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'user',
    smtpPass: 'pass',
  },
}));

const mockSendMail = vi.fn().mockResolvedValue({
  accepted: ['recipient@example.com'],
  rejected: [] as string[],
  messageId: '<test-message-id@test>',
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: mockSendMail,
    }),
  },
}));

import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

const resolvedConfigured: ResolvedSmtpOutboundConfig = {
  configured: true,
  fromAddress: 'noreply@test.example',
  smtpHost: 'smtp.test.example',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'user',
  smtpPass: 'pass',
};

describe('mailer when configured', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    // These tests exercise the real send path; set production so the dev
    // redirect does not suppress emails before they reach the transport mock.
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    _resetDevRedirectActiveCache();
  });

  it('sendMail calls transport and returns result', async () => {
    const { sendMail, isResolvedMailerConfigured } = await import('./mailer.js');

    expect(isResolvedMailerConfigured(resolvedConfigured)).toBe(true);

    const result = await sendMail(resolvedConfigured, {
      to: 'recipient@example.com',
      subject: 'Subject',
      text: 'Text body',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@test.example',
        to: ['recipient@example.com'],
        subject: 'Subject',
        text: 'Text body',
      }),
    );
    expect(result).toEqual({
      accepted: ['recipient@example.com'],
      rejected: [],
      messageId: '<test-message-id@test>',
    });
  });

  it('uses params.from when provided', async () => {
    const { sendMail } = await import('./mailer.js');

    await sendMail(resolvedConfigured, {
      to: 'x@y.com',
      subject: 'S',
      from: 'custom@from.example',
    });

    expect(mockSendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 'custom@from.example' }),
    );
  });

  it('passes html and replyTo to transport', async () => {
    const { sendMail } = await import('./mailer.js');

    await sendMail(resolvedConfigured, {
      to: 'user@example.com',
      subject: 'HTML test',
      text: 'Plain',
      html: '<p>HTML body</p>',
      replyTo: 'reply@example.com',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<p>HTML body</p>',
        replyTo: 'reply@example.com',
      }),
    );
  });
});
