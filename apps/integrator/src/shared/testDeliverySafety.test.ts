import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import {
  isLocalDevelopmentDeliverySuppressed,
  isTestDeployment,
  isTestDeliveryRecipientAllowed,
  readTestAccountIdentifiers,
} from './testDeliverySafety.js';

const TEST_ENV_KEYS = [
  'NODE_ENV',
  'VITEST',
  'TEST',
  'TEST_ACCOUNT_PHONES',
  'TEST_ACCOUNT_TELEGRAM_IDS',
  'TEST_ACCOUNT_MAX_IDS',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_WEB_PUSH_USER_IDS',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
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

    expect(sent).toEqual([outgoing]);
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

  it('TEST delivers an allowlisted recipient unchanged', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });
    const outgoing = intent('email', { email: 'OWNER@example.org' });

    await port.dispatchOutgoing(outgoing);

    expect(sent).toEqual([outgoing]);
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
