/**
 * Tests for EmailDeliveryAdapter (PLAN S8 DoD).
 *
 * DoD requirements covered here:
 *   1. An email OutgoingIntent dispatched through dispatchOutgoing reaches sendMail (fake sendMail).
 *   2. With DEV_DELIVERY_REDIRECT=1, an email intent collapses to telegram test chat → sendMail NOT called.
 *   3. fromOverride honored; system SMTP from used when fromOverride absent.
 *   4. EMAIL_NOT_CONFIGURED thrown when SMTP unconfigured.
 *   5. EMAIL_PAYLOAD_INVALID thrown when recipient.email missing.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../../infra/adapters/dispatchPort.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSendMail = vi.fn().mockResolvedValue({ accepted: ['test@example.com'], rejected: [] });
const mockResolveSmtp = vi.fn();

vi.mock('./mailer.js', () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
  isResolvedMailerConfigured: (cfg: { configured: boolean }) => cfg.configured,
}));

vi.mock('../../config/smtpOutbound.js', () => ({
  resolveSmtpOutboundConfig: (...args: unknown[]) => mockResolveSmtp(...args),
}));

// Import AFTER mocks are set up.
const { createEmailDeliveryAdapter } = await import('./deliveryAdapter.js');

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const CONFIGURED_SMTP = {
  configured: true,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'user',
  smtpPass: 'pass',
  fromAddress: 'system@example.com',
};

const UNCONFIGURED_SMTP = {
  configured: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromAddress: '',
};

const fakeDb = {} as import('../../kernel/contracts/index.js').DbPort;

function makeEmailIntent(overrides: Partial<{
  to: string;
  subject: string;
  text: string;
  html: string;
  fromOverride: string;
}>): OutgoingIntent {
  const { to = 'patient@example.com', subject, text, html, fromOverride } = overrides;
  return {
    type: 'message.send',
    meta: { eventId: 'evt-email-test', occurredAt: '2026-06-17T00:00:00.000Z', source: 'email' },
    payload: {
      recipient: { email: to },
      message: { text },
      delivery: { channels: ['email'] },
      ...(subject !== undefined ? { title: subject } : {}),
      ...(html !== undefined ? { html } : {}),
      ...(fromOverride !== undefined ? { fromOverride } : {}),
    },
  };
}

function setProdEnv() {
  process.env.NODE_ENV = 'production';
  delete process.env.DEV_DELIVERY_REDIRECT;
  _resetDevRedirectActiveCache();
}

function restoreTestEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  _resetDevRedirectActiveCache();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createEmailDeliveryAdapter — canHandle', () => {
  const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });

  it('handles message.send with email channel', () => {
    const intent = makeEmailIntent({});
    expect(adapter.canHandle(intent)).toBe(true);
  });

  it('does not handle message.send with telegram channel', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '2026-06-17T00:00:00.000Z', source: 'telegram' },
      payload: { recipient: { chatId: 123 }, message: { text: 'hi' }, delivery: { channels: ['telegram'] } },
    };
    expect(adapter.canHandle(intent)).toBe(false);
  });

  it('does not handle non-message.send intents', () => {
    const intent: OutgoingIntent = {
      type: 'message.delete',
      meta: { eventId: 'e', occurredAt: '2026-06-17T00:00:00.000Z', source: 'email' },
      payload: { delivery: { channels: ['email'] } },
    };
    expect(adapter.canHandle(intent)).toBe(false);
  });
});

describe('EmailDeliveryAdapter — send() in production (no redirect)', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockResolveSmtp.mockResolvedValue(CONFIGURED_SMTP);
    setProdEnv();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it('DoD-1: email intent dispatched through dispatchOutgoing reaches sendMail', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'patient@example.com', subject: 'Hello', text: 'Body text' }));

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      CONFIGURED_SMTP,
      expect.objectContaining({
        to: 'patient@example.com',
        subject: 'Hello',
        text: 'Body text',
      }),
    );
  });

  it('DoD-3a: fromOverride is honored when present', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(makeEmailIntent({
      to: 'patient@example.com',
      subject: 'From specialist',
      text: 'Body',
      fromOverride: 'dr.smith@clinic.example',
    }));

    expect(mockSendMail).toHaveBeenCalledWith(
      CONFIGURED_SMTP,
      expect.objectContaining({ from: 'dr.smith@clinic.example' }),
    );
  });

  it('DoD-3b: system SMTP from used when fromOverride absent', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'patient@example.com', text: 'Body' }));

    // from is NOT passed to sendMail — sendMail itself falls back to resolved.fromAddress
    const callArgs = mockSendMail.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs['from']).toBeUndefined();
    // And the SMTP config passed has the system fromAddress
    expect((mockSendMail.mock.calls[0]![0] as { fromAddress: string }).fromAddress).toBe('system@example.com');
  });

  it('passes html body when present', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'p@e.com', html: '<p>HTML</p>' }));

    expect(mockSendMail).toHaveBeenCalledWith(
      CONFIGURED_SMTP,
      expect.objectContaining({ html: '<p>HTML</p>' }),
    );
  });

  it('uses default subject "BersonCare" when title absent', async () => {
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'p@e.com', text: 'body' }));

    expect(mockSendMail).toHaveBeenCalledWith(
      CONFIGURED_SMTP,
      expect.objectContaining({ subject: 'BersonCare' }),
    );
  });
});

describe('EmailDeliveryAdapter — send() errors in production', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    setProdEnv();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it('throws EMAIL_NOT_CONFIGURED when SMTP not set up', async () => {
    mockResolveSmtp.mockResolvedValue(UNCONFIGURED_SMTP);
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });

    await expect(
      adapter.send(makeEmailIntent({ to: 'p@e.com', text: 'body' })),
    ).rejects.toThrow('EMAIL_NOT_CONFIGURED');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('throws EMAIL_PAYLOAD_INVALID when recipient.email missing', async () => {
    mockResolveSmtp.mockResolvedValue(CONFIGURED_SMTP);
    const adapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });

    const badIntent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e', occurredAt: '2026-06-17T00:00:00.000Z', source: 'email' },
      payload: { recipient: {}, message: { text: 'body' }, delivery: { channels: ['email'] } },
    };

    await expect(adapter.send(badIntent)).rejects.toThrow('EMAIL_PAYLOAD_INVALID');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('EmailDeliveryAdapter — DoD-2: DEV_DELIVERY_REDIRECT per-channel redirect (real email replaced, sendMail called with dev email)', () => {
  /**
   * Q-A rework: the redirect now redirects email→email (to the test user's email),
   * NOT collapses email→telegram. sendMail IS called but with the dev test email,
   * never the real client's email.
   */
  const DEV_EMAIL_TARGET = 'dimmdao@yandex.ru'; // Дмитрий default

  beforeEach(() => {
    mockSendMail.mockClear();
    mockResolveSmtp.mockResolvedValue(CONFIGURED_SMTP);
    // Activate redirect (test/dev env — default). No override for DEV_REDIRECT_EMAIL
    // so the Дмитрий default (dimmdao@yandex.ru) is used.
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT;
    delete process.env.DEV_REDIRECT_EMAIL;
    delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it('email intent with redirect active → sendMail called with dev email, NOT real client email', async () => {
    // Q-A: email stays as email — redirected to dev test user's email address.
    // The email adapter IS reached (channel preserved), sendMail IS called,
    // but with the dev email, never the real client.
    const emailAdapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [emailAdapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'realclient@example.com', subject: 'Reminder', text: 'Hello' }));

    // sendMail IS called — email adapter is reached (channel preserved).
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // But recipient is the dev test email, NOT the real client.
    const callArgs = mockSendMail.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs['to']).toBe(DEV_EMAIL_TARGET);
    expect(callArgs['to']).not.toBe('realclient@example.com');
  });

  it('forced redirect via DEV_DELIVERY_REDIRECT=1 also redirects to dev email (not real client)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_DELIVERY_REDIRECT = '1';
    delete process.env.DEV_REDIRECT_EMAIL;
    delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
    _resetDevRedirectActiveCache();

    const emailAdapter = createEmailDeliveryAdapter({ getDb: () => fakeDb });
    const port = createDefaultDispatchPort({ adapters: [emailAdapter] });

    await port.dispatchOutgoing(makeEmailIntent({ to: 'real@client.com', text: 'body' }));

    // sendMail IS called with the dev test email, NOT the real client.
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMail.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs['to']).toBe(DEV_EMAIL_TARGET);
    expect(callArgs['to']).not.toBe('real@client.com');
  });
});
