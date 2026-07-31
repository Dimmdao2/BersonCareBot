/**
 * УРОВЕНЬ 0, пункт 1 (D20_INTEGRATOR_MAP.md → «Порядок написания тестов»).
 *
 * Предмет проверки — НАБЛЮДАЕМЫЙ АДРЕСАТ: кому в итоге ушло сообщение. Поэтому тесты гоняют
 * не голые функции модуля, а весь чокпойнт `dispatchOutgoing` (dispatchPort → applyPreForkDevRedirect
 * → адаптер канала) и смотрят, ЧТО получил адаптер. Единственный авторитетный редирект живёт именно
 * там (шапка devDeliveryRedirect.ts), а цена ошибки здесь — переписка пациентов у разработчика.
 *
 * Каждый `it` в комментарии называет свою поломку («арбитр»): что сломать в продуктовом коде,
 * чтобы этот тест покраснел. Арбитры прогнаны руками, вывод — в отчёте
 * docs/_TODO/runs/integrator-cleanup/D20_LEVEL0_TESTS_REPORT.md.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import {
  _resetDevRedirectActiveCache,
  isDevRedirectActive,
  resolveDevRedirect,
} from './devDeliveryRedirect.js';

/** Настоящий пациент — ни один его идентификатор не имеет права дойти до адаптера в dev. */
const PATIENT = {
  telegramChatId: 555_000_111,
  maxUserId: 555_000_222,
  phone: '+79990000001',
  email: 'patient@example.org',
  pushUserId: '11111111-1111-4111-8111-111111111111',
} as const;

/** Тестовый адресат редиректа. Задаём явно, чтобы тест не зависел от встроенных дефолтов. */
const TESTER = {
  telegramChatId: 700_000_001,
  maxUserId: 700_000_002,
  phone: '+79180000002',
  email: 'tester@example.org',
  pushUserId: '22222222-2222-4222-8222-222222222222',
} as const;

const REDIRECT_ENV_KEYS = [
  'NODE_ENV',
  'DEV_DELIVERY_REDIRECT',
  'DEV_REDIRECT_TELEGRAM_CHAT_ID',
  'DEV_DELIVERY_REDIRECT_CHAT_ID',
  'TELEGRAM_ADMIN_ID',
  'DEV_REDIRECT_MAX_USER_ID',
  'DEV_REDIRECT_PHONE',
  'DEV_REDIRECT_EMAIL',
  'DEV_REDIRECT_WEB_PUSH_USER_ID',
  'DEV_REDIRECT_DISABLE_DEFAULTS',
  'DEV_REDIRECT_PASSTHROUGH_TELEGRAM',
  'DEV_REDIRECT_PASSTHROUGH_MAX',
  'DEV_REDIRECT_PASSTHROUGH_PHONES',
  'DEV_REDIRECT_PASSTHROUGH_EMAILS',
  'DEV_REDIRECT_PASSTHROUGH_WEB_PUSH',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(REDIRECT_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of REDIRECT_ENV_KEYS) delete process.env[key];
  _resetDevRedirectActiveCache();
});

afterEach(() => {
  for (const key of REDIRECT_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  _resetDevRedirectActiveCache();
});

function setTesterTargets(): void {
  process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
  process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = String(TESTER.telegramChatId);
  process.env.DEV_REDIRECT_MAX_USER_ID = String(TESTER.maxUserId);
  process.env.DEV_REDIRECT_PHONE = TESTER.phone;
  process.env.DEV_REDIRECT_EMAIL = TESTER.email;
  process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = TESTER.pushUserId;
}

/** Интент «отправить человеку» c маркером, который политика egress пропускает на любой канал. */
function patientIntent(
  channel: string,
  recipient: Record<string, unknown>,
  text = 'Результаты анализов готовы',
): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: `evt-${channel}`,
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: channel,
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient,
      message: { text },
      delivery: { channels: [channel] },
    },
  };
}

/** Адаптер, который принимает всё и записывает, ЧТО именно до него дошло. */
function recordingAdapter(): { adapter: DeliveryAdapter; sent: OutgoingIntent[] } {
  const sent: OutgoingIntent[] = [];
  return {
    sent,
    adapter: {
      canHandle: () => true,
      send: async (intent: OutgoingIntent) => {
        sent.push(intent);
        return {};
      },
    } as DeliveryAdapter,
  };
}

function recipientOf(intent: OutgoingIntent): Record<string, unknown> {
  return (intent.payload as { recipient: Record<string, unknown> }).recipient;
}

function textOf(intent: OutgoingIntent): string {
  return (intent.payload as { message?: { text?: string } }).message?.text ?? '';
}

describe('dev-редирект доставки: кому в итоге уходит сообщение', () => {
  describe('в проде редирект выключен — переписка пациента не уходит разработчику', () => {
    it('дано: NODE_ENV=production → когда доставка пациенту → тогда адаптер получает ЕГО адрес без правок', async () => {
      // АРБИТР: в computeIsRedirectActive() убрать проверку NODE_ENV
      // (`return process.env.NODE_ENV !== 'production'` → `return true`) — адаптер получит chatId
      // тестировщика вместо chatId пациента, и тест покраснеет на первом же expect.
      process.env.NODE_ENV = 'production';
      setTesterTargets();
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(
        patientIntent('telegram', { chatId: PATIENT.telegramChatId }),
      );

      expect(isDevRedirectActive()).toBe(false);
      expect(sent).toHaveLength(1);
      expect(recipientOf(sent[0]!)).toEqual({ chatId: PATIENT.telegramChatId });
      expect(textOf(sent[0]!)).toBe('Результаты анализов готовы');
    });

    it('дано: прод + DEV_DELIVERY_REDIRECT=1 → когда доставка → тогда редирект ВСЁ РАВНО активен (осознанный аварийный тумблер)', () => {
      // Тест закрепляет ЕДИНСТВЕННЫЙ способ включить редирект в проде. Если кто-то заведёт второй
      // (новую переменную, чтение из БД, дефолт «включено»), поведение разойдётся с этим тестом.
      // АРБИТР: убрать из computeIsRedirectActive() ветку DEV_DELIVERY_REDIRECT === '1' — тест покраснеет.
      process.env.NODE_ENV = 'production';
      process.env.DEV_DELIVERY_REDIRECT = '1';

      expect(isDevRedirectActive()).toBe(true);
    });

    it('дано: редирект уже вычислен → когда кто-то правит process.env в рантайме → тогда он НЕ выключается на ходу', () => {
      // Флаг заморожен на время жизни процесса. Смысл проверки — направление «нельзя выключить»:
      // иначе случайная мутация env в середине прогона откроет доставку настоящим пациентам.
      // АРБИТР: убрать кэш `_isActive` (считать computeIsRedirectActive() при каждом вызове) —
      // второй expect вернёт false и тест покраснеет.
      process.env.NODE_ENV = 'development';
      expect(isDevRedirectActive()).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(isDevRedirectActive()).toBe(true);
    });
  });

  describe('при активном редиректе НИ ОДНО сообщение не уходит настоящему получателю', () => {
    // Получатель приходит с НЕСКОЛЬКИМИ адресами сразу (так их и собирает резолв целей доставки).
    // Пережить подмену не должен ни один: адаптер, у которого канал упадёт на запасное поле,
    // иначе достучится до настоящего пациента по телефону или почте.
    const patientAllAddresses = {
      chatId: PATIENT.telegramChatId,
      userId: PATIENT.maxUserId,
      phoneNormalized: PATIENT.phone,
      email: PATIENT.email,
      pushUserId: PATIENT.pushUserId,
    };

    const cases = [
      {
        channel: 'telegram',
        expected: { chatId: TESTER.telegramChatId },
      },
      {
        channel: 'max',
        expected: { userId: TESTER.maxUserId, chatId: TESTER.maxUserId },
      },
      {
        channel: 'smsc',
        expected: { phoneNormalized: TESTER.phone },
      },
      {
        channel: 'email',
        expected: { email: TESTER.email },
      },
      {
        channel: 'web_push',
        expected: { pushUserId: TESTER.pushUserId },
      },
    ] as const;

    for (const testCase of cases) {
      it(`дано: dev + канал ${testCase.channel} → когда доставка пациенту → тогда адаптер получает адрес тестировщика и НИ ОДНОГО поля пациента`, async () => {
        // АРБИТР: в applyPreForkDevRedirect() собрать получателя как
        // `recipient: { ...origRecipient, ...outcome.recipient }` вместо `recipient: outcome.recipient`
        // — исходные поля пациента переживут подмену, и toEqual (строгое равенство объекта) покраснеет.
        process.env.NODE_ENV = 'development';
        setTesterTargets();
        const { adapter, sent } = recordingAdapter();
        const port = createDefaultDispatchPort({ adapters: [adapter] });

        await port.dispatchOutgoing(
          patientIntent(testCase.channel, { ...patientAllAddresses }),
        );

        expect(sent).toHaveLength(1);
        // Получатель — РОВНО адрес тестировщика: никакого «плюс исходные поля».
        expect(recipientOf(sent[0]!)).toEqual(testCase.expected);
        // Канал сохранён: сообщение не схлопнулось в telegram.
        expect((sent[0]!.payload as { delivery: { channels: string[] } }).delivery.channels).toEqual(
          [testCase.channel],
        );
        // Ни один идентификатор пациента не выжил в АДРЕСЕ. (В тексте он есть намеренно —
        // это dev-префикс «кому предназначалось»; адресом он не является.)
        const address = JSON.stringify(recipientOf(sent[0]!));
        for (const patientId of Object.values(PATIENT)) {
          expect(address).not.toContain(String(patientId));
        }
      });
    }

    it('дано: dev + текст сообщения → когда доставка → тогда тестировщик видит, кому оно предназначалось', async () => {
      // Без префикса тестировщик не отличит своё сообщение от чужого и не заметит утечку адресации.
      // АРБИТР: в applyPreForkDevRedirect() перестать добавлять buildDevPrefix (оставить origText) —
      // тест покраснеет на проверке префикса.
      process.env.NODE_ENV = 'development';
      setTesterTargets();
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(patientIntent('telegram', { chatId: PATIENT.telegramChatId }));

      expect(textOf(sent[0]!)).toBe(
        `「DEV→ intended: ${PATIENT.telegramChatId}」\n\nРезультаты анализов готовы`,
      );
    });
  });

  describe('нет привязки у тестировщика — отправка гасится, а не идёт «куда попало»', () => {
    it('дано: dev, у тестировщика нет email → когда доставка на email → тогда адаптер НЕ вызван вовсе', async () => {
      // Это буквальное требование D7: нет цели — сообщение не уходит НИКОМУ, а не настоящему адресату.
      // АРБИТР: в resolveDevRedirect() ветку email заменить с
      // `if (targets.email === null) return { kind: 'suppress', ... }` на возврат redirect с
      // `recipient: { email: targets.email }` — адаптер получит `{ email: null }` и/или интент дойдёт
      // до отправки, `sent` перестанет быть пустым, тест покраснеет.
      process.env.NODE_ENV = 'development';
      process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1'; // ни одной цели не настроено
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      const result = await port.dispatchOutgoing(
        patientIntent('email', { email: PATIENT.email }),
      );

      expect(sent).toEqual([]);
      expect(result).toEqual({});
      expect(resolveDevRedirect('email')).toEqual({
        kind: 'suppress',
        reason: 'no_email_binding',
      });
    });

    it('дано: dev + канал, которого нет в перечне целей → когда доставка → тогда гашение, а не выпуск наружу', () => {
      // Неизвестный канал не должен проваливаться в «оставить как есть»: получатель остался бы настоящим.
      // АРБИТР: в normalizeRedirectChannel() в `default` вернуть 'telegram' вместо null —
      // resolveDevRedirect('vk') станет redirect и тест покраснеет.
      process.env.NODE_ENV = 'development';
      setTesterTargets();

      expect(resolveDevRedirect('vk')).toEqual({
        kind: 'suppress',
        reason: 'unknown_channel:vk',
      });
      expect(resolveDevRedirect(null)).toEqual({
        kind: 'suppress',
        reason: 'unknown_channel:null',
      });
    });
  });

  describe('passthrough-исключения выключены по умолчанию и работают только поимённо', () => {
    it('дано: dev, allowlist пуст → когда доставка пациенту → тогда он всё равно НЕ получает сообщение', async () => {
      // Самый опасный регресс: «сделать passthrough дефолтом» вернёт доставку настоящим пациентам.
      // АРБИТР: в isDevRedirectPassthrough() вернуть true, когда recipient задан (до чтения allowlist)
      // — адаптер получит chatId пациента и тест покраснеет.
      process.env.NODE_ENV = 'development';
      setTesterTargets();
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(patientIntent('telegram', { chatId: PATIENT.telegramChatId }));

      expect(recipientOf(sent[0]!)).toEqual({ chatId: TESTER.telegramChatId });
    });

    it('дано: в allowlist внесён только второй тестировщик → когда шлём обоим → тогда пациент редиректится, а тестировщик проходит как есть', async () => {
      // АРБИТР: в isDevRedirectPassthrough() ветку telegram сравнивать с
      // DEV_REDIRECT_PASSTHROUGH_MAX (перепутать канал allowlist) — второй expect покраснеет,
      // потому что внесённый в telegram-список адресат будет отредиректен.
      process.env.NODE_ENV = 'development';
      setTesterTargets();
      const secondTester = 700_000_009;
      process.env.DEV_REDIRECT_PASSTHROUGH_TELEGRAM = String(secondTester);
      const { adapter, sent } = recordingAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(patientIntent('telegram', { chatId: PATIENT.telegramChatId }));
      await port.dispatchOutgoing(patientIntent('telegram', { chatId: secondTester }));

      expect(recipientOf(sent[0]!)).toEqual({ chatId: TESTER.telegramChatId });
      expect(recipientOf(sent[1]!)).toEqual({ chatId: secondTester });
      // Прошедшее «как есть» сообщение не помечается dev-префиксом — иначе пациент увидел бы служебную строку.
      expect(textOf(sent[1]!)).toBe('Результаты анализов готовы');
    });
  });
});
