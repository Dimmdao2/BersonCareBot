import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('mailer dev-suppress guard', () => {
  const configured: ResolvedSmtpOutboundConfig = {
    configured: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'user',
    smtpPass: 'pass',
    fromAddress: 'noreply@example.com',
  };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ALLOW_DEV_EMAIL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('suppresses send in non-production (NODE_ENV=test) without override', async () => {
    const result = await sendMail(configured, {
      to: 'client@example.com',
      subject: 'Test',
      text: 'Body',
    });
    // guard fires before transport is created: returns empty result, no network call
    expect(result).toEqual({ accepted: [], rejected: [] });
    expect(result.messageId).toBeUndefined();
  });

  it('suppresses send when NODE_ENV is not set (undefined treated as non-production)', async () => {
    vi.stubEnv('NODE_ENV', '');
    const result = await sendMail(configured, {
      to: 'client@example.com',
      subject: 'Subj',
    });
    expect(result).toEqual({ accepted: [], rejected: [] });
  });
});
