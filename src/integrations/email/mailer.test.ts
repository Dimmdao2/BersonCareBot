import { describe, expect, it } from 'vitest';
import { isMailerConfigured, sendMail } from './mailer.js';

describe('mailer when not configured', () => {
  it('isMailerConfigured returns false when SMTP env is not set', () => {
    expect(isMailerConfigured()).toBe(false);
  });

  it('sendMail returns empty accepted and rejected without sending', async () => {
    const result = await sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Body',
    });
    expect(result).toEqual({ accepted: [], rejected: [] });
    expect(result.messageId).toBeUndefined();
  });

  it('sendMail accepts array of recipients', async () => {
    const result = await sendMail({
      to: ['a@b.com', 'c@d.com'],
      subject: 'Hi',
    });
    expect(result).toEqual({ accepted: [], rejected: [] });
  });
});
