/**
 * УРОВЕНЬ 0, пункт 2 (D20_INTEGRATOR_MAP.md → «Порядок написания тестов»): резолв ПОЛУЧАТЕЛЯ.
 * Цена ошибки — сообщение уходит другому человеку.
 *
 * ── ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО ЗДЕСЬ НЕТ ──────────────────────────────────────────────
 * Карта называет четыре модуля. Они очень разные по тестируемости, и это разделение
 * зафиксировано намеренно (подробности — в отчёте D20_LEVEL0_TESTS_REPORT.md):
 *
 *  • `max/maxRecipient.ts` — чистые функции. Проверяются входом и выходом, доказательство полное.
 *    Именно здесь живёт названный картой риск «chatId прочитан как userId».
 *  • `repos/userLookup.ts` — маршрутизатор поверх `channelUsers`. Проверяется тем, ЧТО и в каком
 *    порядке уходит за границу модуля: у двух соседних функций `channelUsers` порядок аргументов
 *    ЗЕРКАЛЬНЫЙ (`(db, phone, resource)` против `(db, resource, externalId)`), перепутать их —
 *    однострочная правка, дающая поиск телефона по имени канала.
 *  • `repos/platformUserByChannel.ts` / `repos/platformUserDeliveryPhone.ts` — здесь проверяется
 *    ТОЛЬКО постобработка строки, вернувшейся из БД (пустое/пробельное → отказ вместо адреса).
 *    Сам SQL — отбор по цепочке слияний, «один телефон у двух пользователей», LIMIT 1 — на фейковой
 *    БД недоказуем в принципе: это была бы проверка собственной заглушки (правило репозитория, п. 7).
 *    Что осталось непокрытым и почему — отдельным разделом в отчёте.
 *
 * У каждого `it` в комментарии — свой арбитр. Арбитры прогнаны руками, вывод — в отчёте.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  maxBindingRecipient,
  maxChatRecipient,
  maxUserRecipient,
  parseMaxPlatformUserId,
  readMaxOutboundRecipient,
} from '../../../integrations/max/maxRecipient.js';
import { resolveCanonicalPlatformUserIdByChannel } from './platformUserByChannel.js';
import { getPhoneNormalizedForDeliveryLookup } from './platformUserDeliveryPhone.js';

vi.mock('./channelUsers.js', () => ({
  findByIdentityByPhone: vi.fn(async () => ({ chatId: 1, channelId: '1', username: null })),
  getLinkDataByIdentity: vi.fn(async () => ({ userId: '1', channelId: '1' })),
}));

// Импорт ПОСЛЕ vi.mock — userLookup.ts должен увидеть подменённую границу.
const { findByIdentityByPhone, getLinkDataByIdentity } = await import('./channelUsers.js');
const { lookupUser, findUserByChannelId, findUserByPhone } = await import('./userLookup.js');

/** Фейковая БД: отдаёт заранее заданные строки и запоминает, о чём её спросили. */
function fakeDb(rows: Record<string, unknown>[]): DbPort & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      calls.push([sql, params]);
      return { rows: rows as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(this as unknown as DbPort);
    },
  } as DbPort & { calls: unknown[][] };
}

describe('резолв получателя MAX: чат — это не человек с тем же числом', () => {
  it('дано: получатель задан chatId → когда разбор исходящего → тогда это ЧАТ, а не пользователь с тем же id', () => {
    // Карта: «прямая точка риска "сообщение не тому"». MAX адресует РАЗНЫЕ сущности одинаковыми
    // числами: POST /messages?user_id= и ?chat_id=. Склеить их — значит писать постороннему.
    // АРБИТР: в readMaxOutboundRecipient() свести две ветки в одну —
    // `const id = parseMaxPlatformUserId(r.userId ?? r.chatId); return { userId: id }` —
    // первый expect получит { userId: 42 } вместо { chatId: 42 } и покраснеет.
    expect(readMaxOutboundRecipient({ chatId: 42 })).toEqual({ chatId: 42 });
    expect(readMaxOutboundRecipient({ userId: 42 })).toEqual({ userId: 42 });
  });

  it('дано: заданы и userId, и chatId → когда разбор → тогда выигрывает userId (адресуем человека, а не диалог)', () => {
    // АРБИТР: поменять в readMaxOutboundRecipient() порядок — сначала читать chatId, потом userId —
    // тест покраснёт: сообщение уйдёт в чат 777, а не человеку 555.
    expect(readMaxOutboundRecipient({ userId: 555, chatId: 777 })).toEqual({ userId: 555 });
  });

  it('дано: получатель неразбираем → когда разбор → тогда пустой адрес, и отправлять некуда', () => {
    // Пустой объект — это «адреса нет»; вызывающий обязан не отправлять. Опасен был бы фолбэк
    // на любое непустое значение.
    // АРБИТР: в readMaxOutboundRecipient() вернуть `{ userId: 0 }` вместо `{}` в конце —
    // тест покраснеет, а в бою нулевой id ушёл бы в провайдера как настоящий адрес.
    expect(readMaxOutboundRecipient(null)).toEqual({});
    expect(readMaxOutboundRecipient(undefined)).toEqual({});
    expect(readMaxOutboundRecipient('7924656602')).toEqual({});
    expect(readMaxOutboundRecipient({ chatId: 'не-число' })).toEqual({});
    expect(readMaxOutboundRecipient({ chatId: '' })).toEqual({});
  });

  it('дано: id пришёл строкой и числом → когда разбор → тогда результат ОДИН и тот же', () => {
    // Расхождение форм = один человек адресуется двумя разными способами, часть сообщений теряется.
    // АРБИТР: в parseMaxPlatformUserId() убрать строковую ветку (`/^\d+$/`) — строковые входы дадут
    // undefined, и тест покраснеет.
    expect(parseMaxPlatformUserId(207278131)).toBe(207278131);
    expect(parseMaxPlatformUserId('207278131')).toBe(207278131);
    expect(parseMaxPlatformUserId(' 207278131 ')).toBe(207278131);
  });

  it('дано: id-мусор → когда разбор → тогда undefined, а НЕ «почти похожее» число', () => {
    // '12abc' → 12 было бы адресом ДРУГОГО человека. Number('12abc') = NaN, но parseInt('12abc') = 12:
    // подмена одной функции на другую здесь и есть та самая необратимая ошибка.
    // АРБИТР: в parseMaxPlatformUserId() заменить проверку `/^\d+$/.test(...)` + Number на
    // `Number.parseInt(value, 10)` — '12abc' станет 12 и тест покраснеет.
    expect(parseMaxPlatformUserId('12abc')).toBeUndefined();
    expect(parseMaxPlatformUserId('')).toBeUndefined();
    expect(parseMaxPlatformUserId('  ')).toBeUndefined();
    expect(parseMaxPlatformUserId(null)).toBeUndefined();
    expect(parseMaxPlatformUserId({})).toBeUndefined();
    expect(parseMaxPlatformUserId(Number.NaN)).toBeUndefined();
    expect(parseMaxPlatformUserId('+79189000782')).toBeUndefined();
  });

  it('дано: нулевой или отрицательный id → когда сборка получателя → тогда ОТКАЗ, а не отправка', () => {
    // Отправка «по id 0» — это отправка неизвестно кому; отказ обязан произойти до провайдера.
    // АРБИТР: в maxUserRecipient()/maxChatRecipient() убрать условие `|| userId <= 0` —
    // функции вернут { userId: 0 } / { chatId: -5 } вместо броска, и тест покраснеет.
    expect(() => maxUserRecipient(0)).toThrow('MAX_RECIPIENT_INVALID');
    expect(() => maxUserRecipient('0')).toThrow('MAX_RECIPIENT_INVALID');
    expect(() => maxUserRecipient(-5)).toThrow('MAX_RECIPIENT_INVALID');
    expect(() => maxChatRecipient(0)).toThrow('MAX_RECIPIENT_INVALID');
    expect(() => maxChatRecipient('не-число')).toThrow('MAX_RECIPIENT_INVALID');
  });

  it('дано: внешний id привязки пуст → когда сборка → тогда берётся legacy chatId, а при отсутствии обоих — отказ', () => {
    // АРБИТР: в maxBindingRecipient() убрать фолбэк на legacyChatId — первый expect покраснеет
    // (сообщение по старой привязке перестанет доходить вовсе).
    expect(maxBindingRecipient('', 207278131)).toEqual({ userId: 207278131 });
    expect(maxBindingRecipient('207278131', 999)).toEqual({ userId: 207278131 });
    expect(() => maxBindingRecipient('', undefined)).toThrow('MAX_RECIPIENT_INVALID');
  });
});

describe('маршрут резолва: по какому ключу ищем человека', () => {
  it('дано: ключ поиска неизвестен → когда lookupUser → тогда НИЧЕГО не ищется и возвращается null', () => {
    // Самая дорогая ошибка маршрутизатора — «непонятный ключ трактуем как телефон/канал».
    // АРБИТР: в userLookup.ts заменить финальный `return null` на
    // `return findByIdentityByPhone(db, value, resource)` — произвольный ключ станет поиском по
    // телефону, границу дёрнут, и оба expect покраснеют.
    vi.mocked(findByIdentityByPhone).mockClear();
    vi.mocked(getLinkDataByIdentity).mockClear();
    const db = fakeDb([]);

    return lookupUser(db, 'telegram', 'chatId', '7924656602').then((result) => {
      expect(result).toBeNull();
      expect(findByIdentityByPhone).not.toHaveBeenCalled();
      expect(getLinkDataByIdentity).not.toHaveBeenCalled();
    });
  });

  it('дано: ключ «телефон» и ключ «канал» → когда lookupUser → тогда телефон и ресурс НЕ меняются местами', () => {
    // У двух соседних функций channelUsers порядок аргументов зеркальный:
    //   findByIdentityByPhone(db, phone, resource) / getLinkDataByIdentity(db, resource, externalId).
    // Перепутать их — правка на одно слово, а результат: телефон ищется как имя канала, а имя
    // канала — как телефон. Найдётся не тот человек или не найдётся никто.
    // АРБИТР: в userLookup.ts поменять аргументы местами в любой из двух строк —
    // соответствующий expect покраснеет.
    vi.mocked(findByIdentityByPhone).mockClear();
    vi.mocked(getLinkDataByIdentity).mockClear();
    const db = fakeDb([]);

    return Promise.all([
      lookupUser(db, 'max', 'phone', '+79189000782'),
      lookupUser(db, 'max', 'channelId', '207278131'),
      lookupUser(db, 'max', 'externalId', '207278131'),
    ]).then(() => {
      expect(findByIdentityByPhone).toHaveBeenCalledWith(db, '+79189000782', 'max');
      expect(getLinkDataByIdentity).toHaveBeenNthCalledWith(1, db, 'max', '207278131');
      expect(getLinkDataByIdentity).toHaveBeenNthCalledWith(2, db, 'max', '207278131');
    });
  });

  it('дано: telegram-хелперы без явного канала → когда вызов → тогда канал именно telegram, а не «текущий»', () => {
    // findUserByPhone/findUserByChannelId зашивают ресурс. Если зашить не тот, сообщение уйдёт
    // человеку с тем же id в ДРУГОМ мессенджере.
    // АРБИТР: в findUserByChannelId() заменить 'telegram' на 'max' — второй expect покраснеет.
    vi.mocked(findByIdentityByPhone).mockClear();
    vi.mocked(getLinkDataByIdentity).mockClear();
    const db = fakeDb([]);

    return Promise.all([
      findUserByPhone(db, '+79189000782'),
      findUserByChannelId(db, '7924656602'),
    ]).then(() => {
      expect(findByIdentityByPhone).toHaveBeenCalledWith(db, '+79189000782', 'telegram');
      expect(getLinkDataByIdentity).toHaveBeenCalledWith(db, 'telegram', '7924656602');
    });
  });
});

describe('резолв платформенного пользователя: «ничего не нашли» — это отказ, а не пустой адрес', () => {
  it('дано: привязки канала нет → когда резолв по каналу → тогда null, и отправлять некому', async () => {
    // АРБИТР: в resolveCanonicalPlatformUserIdByChannel() вернуть `row?.platform_user_id ?? ''`
    // вместо null-проверки — второй expect (пустая строка) покраснеет.
    const empty = fakeDb([]);
    expect(await resolveCanonicalPlatformUserIdByChannel(empty, {
      channelCode: 'telegram',
      externalId: '7924656602',
    })).toBeNull();
  });

  it('дано: БД вернула пробельный id → когда резолв → тогда null, а не «пользователь с пустым id»', () => {
    // Пустая строка, дошедшая до адресации, — это отправка неизвестно кому: она непустая как
    // значение и проходит все `if (userId)` дальше по цепочке.
    // АРБИТР: в resolveCanonicalPlatformUserIdByChannel() заменить возврат на
    // `return row?.platform_user_id ?? null` (без проверки trim) — тест покраснеет:
    // вернётся '   ' вместо null.
    const blank = fakeDb([{ platform_user_id: '   ' }]);
    return expect(
      resolveCanonicalPlatformUserIdByChannel(blank, {
        channelCode: 'telegram',
        externalId: '7924656602',
      }),
    ).resolves.toBeNull();
  });

  it('дано: id найден с посторонними пробелами → когда резолв → тогда он обрезан до канонической формы', () => {
    // Один и тот же человек не должен получаться «двумя разными» из-за пробела в ключе.
    // АРБИТР: убрать `.trim()` в возвращаемом значении — тест покраснеет.
    const found = fakeDb([{ platform_user_id: ' 1c312a64-fab8-4b75-b24e-88a1d6ebe4e0 ' }]);
    return expect(
      resolveCanonicalPlatformUserIdByChannel(found, {
        channelCode: 'telegram',
        externalId: '7924656602',
      }),
    ).resolves.toBe('1c312a64-fab8-4b75-b24e-88a1d6ebe4e0');
  });

  it('дано: ключ пользователя пуст → когда резолв телефона доставки → тогда в БД НЕ ходим вовсе', () => {
    // Пустой ключ в предикате `id::text = $1 OR integrator_user_id::text = $1` — это запрос
    // «отдай хоть что-нибудь». Отказ обязан произойти ДО похода в базу.
    // АРБИТР: в getPhoneNormalizedForDeliveryLookup() убрать `if (!trimmed) return null` —
    // запрос уйдёт в БД, `db.calls` перестанет быть пустым, тест покраснеет.
    const db = fakeDb([{ phone_normalized: '+79189000782' }]);
    return Promise.all([
      getPhoneNormalizedForDeliveryLookup(db, ''),
      getPhoneNormalizedForDeliveryLookup(db, '   '),
    ]).then((results) => {
      expect(results).toEqual([null, null]);
      expect(db.calls).toEqual([]);
    });
  });

  it('дано: у найденного пользователя телефон пуст → когда резолв → тогда null, а не пустой номер в SMS', () => {
    // АРБИТР: в getPhoneNormalizedForDeliveryLookup() вернуть `raw ?? null` без проверки
    // на непустоту — пробельная строка дойдёт до SMS-адаптера, и первый expect покраснеет.
    const blank = fakeDb([{ phone_normalized: '   ' }]);
    const missing = fakeDb([{ phone_normalized: null }]);
    return Promise.all([
      getPhoneNormalizedForDeliveryLookup(blank, '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'),
      getPhoneNormalizedForDeliveryLookup(missing, '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'),
    ]).then((results) => {
      expect(results).toEqual([null, null]);
    });
  });
});
