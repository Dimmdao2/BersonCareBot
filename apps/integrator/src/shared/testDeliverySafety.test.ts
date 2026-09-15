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

  // Флаги раннера (`TEST`, `VITEST`, `VITEST_WORKER_ID`) присутствуют и в окружении выкладки, и в
  // собственном процессе vitest. Проверяем не значение helper'а, а ВЫХОД цепочки: дошёл ли
  // неразрешённый настоящий получатель до адаптера. Стену снимает только положительно опознанный
  // раннер — отсутствие `NODE_ENV` им не является, `config/env.ts` считает такой процесс production.
  it.each([
    {
      name: 'названный стенд TEST не открывается лишним VITEST',
      env: { NODE_ENV: 'production', TEST: 'true', VITEST: 'true' },
      reachesAdapter: false,
    },
    {
      name: 'стенд TEST, потерявший строку NODE_ENV, тоже не открывается',
      env: { TEST: 'true', VITEST: 'true' },
      reachesAdapter: false,
    },
    {
      name: 'на DEV протёкший VITEST_WORKER_ID стену не снимает',
      env: { NODE_ENV: 'development', TEST: 'true', VITEST_WORKER_ID: '1' },
      reachesAdapter: false,
    },
    {
      name: 'собственный процесс раннера стендом не является и доставку не глушит',
      env: { NODE_ENV: 'test', TEST: 'true', VITEST: 'true' },
      reachesAdapter: true,
    },
  ])('$name', async ({ env, reachesAdapter }) => {
    Object.assign(process.env, env);
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });
    const outgoing = intent('telegram', { chatId: 555000111 });

    const result = await port.dispatchOutgoing(outgoing);

    expect(sent.map((delivered) => delivered.payload.recipient)).toEqual(
      reachesAdapter ? [outgoing.payload.recipient] : [],
    );
    expect(result).toEqual(reachesAdapter ? {} : { suppressedByEnvironment: true });
  });

  it('TEST suppresses email when the allowed-recipient list is absent entirely', async () => {
    // Список получателей приезжает из окружения выкладки. Пропал список — доставка обязана
    // замолчать, а не выпустить кого угодно: иначе стенд молча пишет живым людям.
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });
    const result = await port.dispatchOutgoing(intent('email', { email: 'someone@example.org' }));
    expect(result).toEqual({ suppressedByEnvironment: true });
    expect(sent).toEqual([]);
  });

  it.each(['max', 'vk', 'smsc', 'web_push'])(
    'on DEV the %s channel never reaches its adapter',
    async (channel) => {
      // Исключение на DEV ровно одно — почта в петлевой приёмник. Всё остальное обязано молчать,
      // и проверяется это по КАЖДОМУ каналу, а не по одному телеграму. Набор каналов — тот же,
      // что пропускает политика исходящих (`outboundMessagePolicy.ts`): telegram, max, vk, smsc,
      // web_push и email. `sms` публичным входом не является и до адаптера не доходит вовсе.
      // Телеграма здесь нет намеренно: его DEV-клетку держит ряд «на DEV протёкший
      // VITEST_WORKER_ID стену не снимает» выше, и вторая защита на ту же поломку — дубль (§10a).
      process.env.NODE_ENV = 'development';
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });
      const result = await port.dispatchOutgoing(
        intent(channel, {
          chatId: 555000111,
          userId: 'u-1',
          phoneNormalized: '+79990000001',
          pushUserId: 'u-1',
        }),
      );
      expect(result).toEqual({ suppressedByEnvironment: true });
      expect(sent).toEqual([]);
    },
  );

  it('on DEV email reaches the network boundary only through loopback SMTP', async () => {
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
    const port = createDefaultDispatchPort({
      adapters: [createEmailDeliveryAdapter({ getDb: () => ({}) as never })],
    });

    await expect(port.dispatchOutgoing(emailIntent())).resolves.toEqual({});

    activeSmtp = { ...loopbackSmtp, smtpHost: 'smtp.external.example' };
    await expect(port.dispatchOutgoing(emailIntent())).resolves.toEqual({
      suppressedByEnvironment: true,
      environmentSuppressionReason: 'development_non_loopback_smtp_host',
    });

    expect(mailFakes.sendMail).toHaveBeenCalledOnce();
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

  // Каждый канал сверяется со СВОИМ списком — и видно это по тому, доходит ли сообщение до
  // адаптера, а не по значению предиката. Чужой идентификатор (номер из списка телефонов в поле
  // телеграма и наоборот) обязан подавляться так же, как посторонний.
  it.each([
    { channel: 'telegram', allowed: { chatId: 700000001 }, foreign: { chatId: 800000001 } },
    { channel: 'max', allowed: { userId: 800000001 }, foreign: { userId: 700000001 } },
    {
      channel: 'smsc',
      allowed: { phoneNormalized: '+7 (918) 000-00-02' },
      foreign: { phoneNormalized: '+79180000009' },
    },
    { channel: 'email', allowed: { email: 'owner@example.org' }, foreign: { email: 'owner@example.com' } },
    {
      channel: 'web_push',
      allowed: { pushUserId: '22222222-2222-4222-8222-222222222222' },
      foreign: { pushUserId: '33333333-3333-4333-8333-333333333333' },
    },
    { channel: 'vk', allowed: { userId: 800000001 }, foreign: { userId: 'known' } },
  ])('on TEST the $channel channel admits only its own list', async ({ channel, allowed, foreign }) => {
    process.env.NODE_ENV = 'production';
    process.env.TEST = 'true';
    configureTestAccounts();
    const { adapter, sent } = recordingAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    const foreignResult = await port.dispatchOutgoing(intent(channel, foreign));
    const allowedResult = await port.dispatchOutgoing(intent(channel, allowed));

    expect(foreignResult).toEqual({ suppressedByEnvironment: true });
    // `vk` собственного списка не имеет вовсе — разрешённых получателей у него на стенде нет.
    expect(sent.map((delivered) => delivered.payload.recipient)).toEqual(
      channel === 'vk' ? [] : [allowed],
    );
    expect(allowedResult).toEqual(channel === 'vk' ? { suppressedByEnvironment: true } : {});
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
