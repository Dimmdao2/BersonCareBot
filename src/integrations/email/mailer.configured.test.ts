import { describe, expect, it, vi } from 'vitest';

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

describe('mailer when configured', () => {
  it('sendMail calls transport and returns result', async () => {
    const { sendMail, isMailerConfigured } = await import('./mailer.js');

    expect(isMailerConfigured()).toBe(true);

    const result = await sendMail({
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

    await sendMail({
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

    await sendMail({
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
