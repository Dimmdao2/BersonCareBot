import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../kernel/contracts/index.js';

const mailFakes = vi.hoisted(() => ({
  resolveSmtpOutboundConfig: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('../config/smtpOutbound.js', () => ({
  resolveSmtpOutboundConfig: mailFakes.resolveSmtpOutboundConfig,
}));
vi.mock('../integrations/email/mailer.js', () => ({ sendMail: mailFakes.sendMail }));

import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import { createEmailDeliveryAdapter } from '../integrations/email/deliveryAdapter.js';
import type { ResolvedSmtpOutboundConfig } from '../config/smtpOutbound.js';
import {
  isLocalDevelopmentDeliverySuppressed,
  isTestDeployment,
  isTestDeliveryRecipientAllowed,
  readTestAccountIdentifiers,
} from './testDeliverySafety.js';

const TEST_ENV_KEYS = [
  'NODE_ENV',
  'VITEST',
  'VITEST_WORKER_ID',
  'TEST',
  'TEST_ACCOUNT_PHONES',
  'TEST_ACCOUNT_TELEGRAM_IDS',
  'TEST_ACCOUNT_MAX_IDS',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_WEB_PUSH_USER_IDS',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of TEST_ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of TEST_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function intent(channel: string, recipient: Record<string, unknown>): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: `evt-${channel}`,
      occurredAt: '2026-08-27T08:00:00.000Z',
      source: channel,
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient,
      message: { text: 'Проверка' },
      delivery: { channels: [channel] },
    },
  };
}

function emailIntent(): OutgoingIntent {
  const outgoing = intent('email', { email: 'recipient@example.test' });
  return { ...outgoing, payload: { ...outgoing.payload, subject: 'DEV mail trap proof' } };
}

function recordingAdapter(): { adapter: DeliveryAdapter; sent: OutgoingIntent[] } {
  const sent: OutgoingIntent[] = [];
  return {
    sent,
    adapter: {
      canHandle: () => true,
      send: async (outgoing: OutgoingIntent) => {
        sent.push(outgoing);
        return {};
      },
    } as DeliveryAdapter,
  };
}

function configureTestAccounts(): void {
  process.env.TEST_ACCOUNT_TELEGRAM_IDS = '700000001,700000002';
  process.env.TEST_ACCOUNT_MAX_IDS = '800000001';
  process.env.TEST_ACCOUNT_PHONES = '+79180000001,+79180000002';
  process.env.TEST_ACCOUNT_EMAILS = 'Owner@Example.org,tester@example.org';
  process.env.TEST_ACCOUNT_WEB_PUSH_USER_IDS = '22222222-2222-4222-8222-222222222222';
}

describe('final TEST delivery safety gate', () => {
  it('production without TEST passes the original recipient and text unchanged', async () => {
    process.env.NODE_ENV = 'production';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });
    const outgoing = intent('telegram', { chatId: 555000111 });

    await port.dispatchOutgoing(outgoing);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.recipient).toEqual(outgoing.payload.recipient);
    expect(sent[0]?.payload.message).toEqual(outgoing.payload.message);
  });

  it('does not confuse the Vitest TEST variable with a deployed TEST environment', () => {
    expect(isTestDeployment({ TEST: 'true', VITEST: 'true' })).toBe(false);
    expect(isTestDeployment({ TEST: 'true' })).toBe(true);
  });

  it('local development suppresses delivery while the Vitest process does not', () => {
    expect(isLocalDevelopmentDeliverySuppressed({ NODE_ENV: 'development' })).toBe(true);
    expect(
      isLocalDevelopmentDeliverySuppressed({
        NODE_ENV: 'development',
        VITEST_WORKER_ID: '1',
      }),
    ).toBe(false);
  });

  it('on DEV sends email only through loopback SMTP and always suppresses telegram', async () => {
    process.env.NODE_ENV = 'development';
    const loopbackSmtp: ResolvedSmtpOutboundConfig = {
      configured: true,
      smtpHost: '127.0.0.1',
      smtpPort: 1025,
      smtpSecure: false,
      smtpUser: 'dev',
      smtpPass: 'dev',
      fromAddress: 'dev-staff@therapysto.local',
    };
    let activeSmtp = loopbackSmtp;
    mailFakes.resolveSmtpOutboundConfig.mockImplementation(async () => activeSmtp);
    mailFakes.sendMail.mockResolvedValue({
      accepted: ['recipient@example.test'],
      rejected: [],
      messageId: 'mailpit-1',
    });
    const telegram = recordingAdapter();
    const port = createDefaultDispatchPort({
      adapters: [createEmailDeliveryAdapter({ getDb: () => ({}) as never }), telegram.adapter],
    });

    await expect(port.dispatchOutgoing(emailIntent())).resolves.toEqual({});

    activeSmtp = { ...loopbackSmtp, smtpHost: 'smtp.external.example' };
    await expect(port.dispatchOutgoing(emailIntent())).resolves.toEqual({
      suppressedByEnvironment: true,
      environmentSuppressionReason: 'development_non_loopback_smtp_host',
    });

    activeSmtp = loopbackSmtp;
    const telegramWithLoopbackSmtp = await port.dispatchOutgoing(
      intent('telegram', { chatId: '700000001' }),
    );
    activeSmtp = { ...loopbackSmtp, smtpHost: 'smtp.external.example' };
    const telegramWithExternalSmtp = await port.dispatchOutgoing(
      intent('telegram', { chatId: '700000001' }),
    );

    expect(telegramWithLoopbackSmtp).toEqual({ suppressedByEnvironment: true });
    expect(telegramWithExternalSmtp).toEqual({ suppressedByEnvironment: true });
    expect(mailFakes.sendMail).toHaveBeenCalledOnce();
    expect(telegram.sent).toEqual([]);
  });

  it('TEST suppresses a real recipient instead of redirecting it', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    const result = await port.dispatchOutgoing(intent('telegram', { chatId: 555000111 }));

    expect(result).toEqual({ suppressedByEnvironment: true });
    expect(sent).toEqual([]);
  });

  it('TEST suppresses a non-allowlisted email recipient before the adapter', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    const result = await port.dispatchOutgoing(intent('email', { email: 'outside@example.org' }));

    expect(result).toEqual({ suppressedByEnvironment: true });
    expect(sent).toEqual([]);
  });

  it('TEST delivers an allowlisted recipient unchanged', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });
    const outgoing = intent('email', { email: 'OWNER@example.org' });

    await port.dispatchOutgoing(outgoing);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.recipient).toEqual(outgoing.payload.recipient);
    expect(sent[0]?.payload.message).toEqual(outgoing.payload.message);
  });

  it('matches each supported channel only against its own env list', () => {
    configureTestAccounts();
    const identifiers = readTestAccountIdentifiers();

    expect(isTestDeliveryRecipientAllowed('telegram', { chatId: 700000001 }, identifiers)).toBe(true);
    expect(isTestDeliveryRecipientAllowed('max', { userId: 800000001 }, identifiers)).toBe(true);
    expect(
      isTestDeliveryRecipientAllowed(
        'smsc',
        { phoneNormalized: '+7 (918) 000-00-02' },
        identifiers,
      ),
    ).toBe(true);
    expect(
      isTestDeliveryRecipientAllowed('email', { email: 'owner@example.org' }, identifiers),
    ).toBe(true);
    expect(
      isTestDeliveryRecipientAllowed(
        'web_push',
        { pushUserId: '22222222-2222-4222-8222-222222222222' },
        identifiers,
      ),
    ).toBe(true);
    expect(isTestDeliveryRecipientAllowed('telegram', { chatId: 800000001 }, identifiers)).toBe(false);
    expect(isTestDeliveryRecipientAllowed('vk', { userId: 'known' }, identifiers)).toBe(false);
  });

  it('TEST fails closed when account env is absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing(intent('telegram', { chatId: 700000001 }));

    expect(sent).toEqual([]);
  });
});
