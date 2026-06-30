import { describe, expect, it } from 'vitest';
import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { isResolvedMailerConfigured, sendMail } from './mailer.js';

const unconfigured: ResolvedSmtpOutboundConfig = {
  configured: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromAddress: '',
};

describe('mailer when not configured', () => {
  it('isResolvedMailerConfigured is false when resolved.confured is false', () => {
    expect(isResolvedMailerConfigured(unconfigured)).toBe(false);
  });

  it('sendMail returns empty accepted and rejected without sending', async () => {
    const result = await sendMail(unconfigured, {
      to: 'user@example.com',
      subject: 'Test',
      text: 'Body',
    });
    expect(result).toEqual({ accepted: [], rejected: [] });
    expect(result.messageId).toBeUndefined();
  });

  it('sendMail accepts array of recipients without transport', async () => {
    const result = await sendMail(unconfigured, {
      to: ['a@b.com', 'c@d.com'],
      subject: 'Hi',
    });
    expect(result).toEqual({ accepted: [], rejected: [] });
  });
});

// NOTE: The interim ALLOW_DEV_EMAIL per-sink guard was retired in S15.
// Dev safety for email is now provided solely by the pre-fork redirect in dispatchPort
// (S11 dispatchPort.redirect.test.ts proves all channels including email collapse to
// the telegram test chat before any adapter can call sendMail).
