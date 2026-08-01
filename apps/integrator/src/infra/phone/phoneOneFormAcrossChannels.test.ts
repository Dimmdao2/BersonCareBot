/**
 * D20 уровень 1, пункт 7 — одна форма номера во всех каналах:
 * `infra/phone/normalizeRuPhoneE164.ts` + `telegram/mapIn.ts` + `max/mapIn.ts`.
 *
 * Цена ошибки (дословно по карте): «Расхождение форматов = один человек становится двумя аккаунтами,
 * и половина его истории теряется». Телефон — единственный общий ключ между мессенджерами, вебаппом и
 * канонической записью пациента, поэтому «+79180000011» и «89180000011» обязаны быть ОДНОЙ строкой.
 *
 * Проверяется наблюдаемый результат разбора входящего события каналом (`fromTelegram` / `fromMax` →
 * поле `phone`), а не внутренности нормализатора: именно это поле уезжает в привязку телефона.
 */
import { describe, expect, it } from 'vitest';
import { fromTelegram } from '../../integrations/telegram/mapIn.js';
import { fromMax } from '../../integrations/max/mapIn.js';
import { normalizeRuPhoneE164 } from './normalizeRuPhoneE164.js';
import type { TelegramWebhookBodyValidated } from '../../integrations/telegram/schema.js';
import type { MaxUpdateValidated } from '../../integrations/max/schema.js';

/** Один и тот же человек и один и тот же номер — в тех видах, в которых их реально присылают. */
const SAME_NUMBER_AS_WRITTEN = [
  '+79180000011',
  '79180000011',
  '89180000011',
  '+7 918 000-00-11',
  '8 (918) 000 00 11',
  '9180000011',
] as const;

const E164 = '+79180000011';

const TG_CHAT_ID = 364943522;
const MAX_USER_ID = 207278131;

/** Пациент нажал в Telegram «Отправить номер телефона». */
function telegramContactPhone(written: string): string | undefined {
  const body = {
    message: {
      message_id: 10,
      chat: { id: TG_CHAT_ID },
      from: { id: TG_CHAT_ID },
      contact: { phone_number: written, user_id: TG_CHAT_ID },
    },
  } as unknown as TelegramWebhookBodyValidated;
  const update = fromTelegram(body, { telegramId: String(TG_CHAT_ID), userRow: null });
  return update && update.kind === 'message' ? update.phone : undefined;
}

/** Тот же человек прислал контакт в MAX (вложение с vCard). */
function maxContactPhone(written: string): string | undefined {
  const body = {
    update_type: 'message_created',
    message: {
      sender: { user_id: MAX_USER_ID },
      recipient: { chat_id: 500100 },
      body: {
        mid: 'mid-1',
        text: '',
        attachments: [
          {
            type: 'contact',
            payload: { vcf_info: `BEGIN:VCARD\r\nTEL;TYPE=CELL:${written}\r\nEND:VCARD` },
          },
        ],
      },
    },
  } as unknown as MaxUpdateValidated;
  const update = fromMax(body, '');
  return update && update.kind === 'message' ? update.phone : undefined;
}

/** Тот же человек вошёл по deep-link `/start setphone_…` (Telegram и MAX разбирают его одинаково). */
function maxStartLinkPhone(written: string): string | undefined {
  const body = {
    update_type: 'message_created',
    message: {
      sender: { user_id: MAX_USER_ID },
      recipient: { chat_id: 500100 },
      body: { mid: 'mid-2', text: `/start setphone_${encodeURIComponent(written)}` },
    },
  } as unknown as MaxUpdateValidated;
  const update = fromMax(body, '');
  return update && update.kind === 'message' ? update.phone : undefined;
}

describe('один номер — одна строка, из какого бы канала он ни пришёл', () => {
  it.each(SAME_NUMBER_AS_WRITTEN)(
    'дано: номер записан как «%s» → когда он приходит из Telegram, из MAX и по ссылке входа → тогда это ОДИН И ТОТ ЖЕ человек',
    (written) => {
      // арбитр: в normalizeTelegramContactPhone убрать ветку `onlyDigits.startsWith('8')` —
      // человек, приславший 8XXX, станет вторым аккаунтом
      expect({
        telegram: telegramContactPhone(written),
        max: maxContactPhone(written),
        startLink: maxStartLinkPhone(written),
      }).toEqual({ telegram: E164, max: E164, startLink: E164 });
    },
  );

  it.each(SAME_NUMBER_AS_WRITTEN)(
    'дано: тот же номер «%s» пришёл из вебаппа (заявка на приём) → тогда форма совпадает с мессенджерами',
    (written) => {
      // арбитр: в normalizeRuPhoneE164 убрать `if (digits.length === 11 && digits.startsWith('8'))`
      // — номер из заявки перестанет сходиться с номером из мессенджера, и пациенту заведут
      // второй аккаунт
      expect(normalizeRuPhoneE164(written)).toBe(E164);
    },
  );

  it('дано: номер пришёл из Telegram в одном виде, из MAX в другом → тогда обе строки совпадают побайтно', () => {
    // Это буквальная формулировка карты: расхождение форматов между каналами = два аккаунта.
    // арбитр: в max/mapIn.ts заменить normalizeTelegramContactPhone на возврат сырого phone —
    // MAX начнёт отдавать '8 (918) 000 00 11', Telegram '+79180000011'
    expect(maxContactPhone('8 (918) 000 00 11')).toBe(telegramContactPhone('+7 918 000-00-11'));
  });

  it('дано: разные номера → тогда строки РАЗНЫЕ (нормализация не склеивает двух людей)', () => {
    // арбитр: в normalizeTelegramContactPhone вернуть константу/обрезанный номер —
    // два разных человека станут одним аккаунтом, это дороже раздвоения
    expect(telegramContactPhone('+79180000011')).not.toBe(telegramContactPhone('+79180000012'));
  });
});

describe('мусор вместо номера', () => {
  it('дано: в контакте прислали не номер → когда канал разбирает → тогда телефона НЕТ (а не мусорная привязка)', () => {
    // арбитр: в normalizeTelegramContactPhone финальный `return null` заменить на
    // `return '+' + onlyDigits` — человек привяжется к номеру, которого не существует
    expect(telegramContactPhone('не телефон')).toBeUndefined();
    expect(maxContactPhone('не телефон')).toBeUndefined();
    expect(telegramContactPhone('123')).toBeUndefined();
  });

  // ДЕФЕКТ, зарегистрирован против карты («мусор вместо номера → телефона нет вовсе, а не
  // мусорная привязка», тот же принцип что и для канального нормализатора выше в этом файле) и
  // решения Р-D20 (тесты под карту, не под нынешний код). Оракул — план: единый смысл «номера
  // нет» во всех точках разбора телефона, а не то, что сегодня возвращает функция. it.fails —
  // тест ОБЯЗАН падать на нынешнем коде: набор остаётся зелёным, дефект виден в отчёте прогона.
  // Починка — отдельная работа (не эта, решение владельца, см. `D20_LEVEL1_TESTS_REPORT.md`
  // «Что НЕ покрыто» п.5.3): свести оба нормализатора к одному контракту `string | null`, а
  // `bookingLifecycleRoute` заставить явно отказывать при `null`, а не подставлять `'+'`.
  it.fails('дано: мусор вместо номера пришёл из вебаппа → тогда телефона НЕТ (как и у канального нормализатора), а не мусорная строка «+» (план: D20_INTEGRATOR_MAP.md, «мусор → телефона нет вовсе»)', () => {
    // ФАКТ на сегодня (не то, что проверяет этот тест): normalizeRuPhoneE164 возвращает
    // вырожденную строку '+' — она выглядит как телефон и склеит между собой все заявки с
    // битым/пустым номером по этому ключу.
    expect(normalizeRuPhoneE164('не телефон')).toBeNull();
    expect(normalizeRuPhoneE164('')).toBeNull();
  });

  // ДЕФЕКТ, зарегистрирован против карты («Расхождение форматов = один человек становится двумя
  // аккаунтами») и решения Р-D20. Оракул — план: одна форма номера во всех каналах, а не то, что
  // сегодня отдают два разных нормализатора. it.fails — тест ОБЯЗАН падать на нынешнем коде: набор
  // остаётся зелёным, дефект виден в отчёте прогона. Починка — отдельная работа (не эта, решение
  // владельца): либо `normalizeTelegramContactPhone` тоже срезает ведущие `00`, либо оба сводятся
  // к одному нормализатору.
  it.fails('дано: номер набран через международный префикс 00 → тогда канал и вебапп дают ОДНУ строку (план п.7: одна форма номера во всех каналах)', () => {
    // ФАКТ на сегодня (не то, что проверяет этот тест): normalizeRuPhoneE164 срезает ведущие
    // '00' (даёт E164), канальный нормализатор — нет (даёт '+0079180000011'). Один человек,
    // две строки, два аккаунта.
    expect(telegramContactPhone('0079180000011')).toBe(normalizeRuPhoneE164('0079180000011'));
  });
});
