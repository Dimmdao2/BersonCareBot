/**
 * D20 уровень 1, пункт 5 — `integrations/webappEntryToken.ts`.
 *
 * Цена ошибки: ссылка входа `?t=…` — единственная identity-функция, оставленная интегратору (D25).
 * Пересланная/подобранная ссылка = ЧУЖОЙ ЧЕЛОВЕК В ЧУЖОМ АККАУНТЕ с медицинскими данными.
 *
 * ЧТО ПРОВЕРЯЕТСЯ И ГДЕ ГРАНИЦА ДОКАЗАННОГО (важно, читать до правки тестов).
 * Интегратор токен только ВЫПУСКАЕТ. Принимает его вебапп — `parseIntegratorToken`
 * (`apps/webapp/src/modules/auth/service.ts:245-272`): проверка подписи, `purpose`, `exp <= now`.
 * Поэтому «истёкший отклонён» / «подделка отклонена» наблюдаемы только на паре выпуск→приём.
 * Ниже стоит `webappAcceptsEntryToken` — ДОСЛОВНАЯ транскрипция того приёмника (тот же HMAC-SHA256
 * по payload, тот же base64url, то же условие `purpose !== 'webapp-entry' || exp <= now`).
 * Это доказывает: выпущенный интегратором токен удовлетворяет/нарушает правило приёмника.
 * Это НЕ доказывает: что вебапп это правило по-прежнему реализует (см. отчёт, раздел «не покрыто»).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Секрет живёт в `config/env` и фиксируется при импорте модуля — подменяем границу, а не process.env. */
const secretState = { value: 'entry-secret-not-a-real-one-0123456789' };
vi.mock('../config/env.js', () => ({
  integratorWebappEntrySecret: () => secretState.value,
}));

const {
  buildWebappEntryTokenFromSource,
  buildWebappEntryUrlFromSource,
  buildWebappEntryUrl,
  buildWebappEntryUrlForMax,
} = await import('./webappEntryToken.js');

const APP_BASE = 'https://app.example';
/** Момент выпуска ссылки; всё время в тестах отсчитывается от него. */
const ISSUED_AT = new Date('2026-07-31T10:00:00.000Z');

type EntryTokenPayload = {
  sub: string;
  role: string;
  purpose: string;
  exp: number;
  displayName?: string;
  integratorUserId?: string;
  bindings?: { telegramId?: string; maxId?: string; vkId?: string };
};

/**
 * Транскрипция приёмника вебаппа (`auth/service.ts:245-272`). Возвращает payload, если вебапп
 * пустил бы человека в аккаунт, и `null`, если отказал.
 */
function webappAcceptsEntryToken(token: string, secret: string): EntryTokenPayload | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const entrySecret = secret.trim();
  if (!entrySecret) return null;
  const expected = createHmac('sha256', entrySecret).update(payload).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  let parsed: EntryTokenPayload;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as EntryTokenPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.purpose !== 'webapp-entry' || parsed.exp <= now) return null;
  return parsed;
}

/** Payload токена без проверки подписи — для утверждений о том, ЧТО интегратор положил внутрь. */
function readTokenPayload(token: string): EntryTokenPayload {
  const payload = token.split('.')[0] ?? '';
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as EntryTokenPayload;
}

/** Пересобирает токен с подменённым payload, подписывая его же секретом (подделка «изнутри»). */
function forgeWithPayload(secret: string, payload: EntryTokenPayload): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${b64}.${createHmac('sha256', secret).update(b64).digest('base64url')}`;
}

function tokenFor(source: 'telegram' | 'max'): string {
  const token =
    source === 'telegram'
      ? buildWebappEntryTokenFromSource({ source: 'telegram', chatId: 364943522 }, APP_BASE)
      : buildWebappEntryTokenFromSource({ source: 'max', maxId: '207278131' }, APP_BASE);
  if (!token) throw new Error('токен не выпущен, хотя секрет и base url заданы');
  return token;
}

beforeEach(() => {
  secretState.value = 'entry-secret-not-a-real-one-0123456789';
  vi.useFakeTimers();
  vi.setSystemTime(ISSUED_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ссылка входа в вебапп: кого она пускает и в чей аккаунт', () => {
  it('дано: ссылка переслана постороннему → когда он открывает её через 5 минут → тогда вебапп НЕ пускает', () => {
    // арбитр: в buildWebappEntryTokenFromSource поставить `now + 3000` вместо `now + 300`
    const token = tokenFor('telegram');

    vi.setSystemTime(new Date(ISSUED_AT.getTime() + 300_000));

    expect(webappAcceptsEntryToken(token, secretState.value)).toBeNull();
  });

  it('дано: та же ссылка открыта самим человеком через 4:59 → тогда вебапп пускает (гейт не «всегда нет»)', () => {
    // арбитр: `now + 300` заменить на `now - 1` — истекает мгновенно, вход ломается всем
    const token = tokenFor('telegram');

    vi.setSystemTime(new Date(ISSUED_AT.getTime() + 299_000));

    expect(webappAcceptsEntryToken(token, secretState.value)?.sub).toBe('tg:364943522');
  });

  it('дано: токен выпущен → когда смотрим срок жизни → тогда ровно 300 секунд от момента выпуска', () => {
    // арбитр: любое изменение слагаемого exp (300 → 3600, 300 → 300_000)
    const payload = readTokenPayload(tokenFor('telegram'));

    expect(payload.exp - Math.floor(ISSUED_AT.getTime() / 1000)).toBe(300);
  });

  it('дано: у токена подменили sub на чужой аккаунт, подпись оставили → тогда вебапп НЕ пускает', () => {
    // арбитр: подписывать не payload, а константу (`sign('static', secret)`) — подпись перестаёт
    // зависеть от содержимого, и подмена sub проходит
    const token = tokenFor('telegram');
    const [payloadB64, signature] = token.split('.');
    const stolen = readTokenPayload(token);
    stolen.sub = 'tg:999000111';
    const forgedPayload = Buffer.from(JSON.stringify(stolen), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    expect(forgedPayload).not.toBe(payloadB64);
    expect(webappAcceptsEntryToken(`${forgedPayload}.${signature}`, secretState.value)).toBeNull();
  });

  it('дано: токен собран и подписан ЧУЖИМ секретом → тогда вебапп НЕ пускает', () => {
    // арбитр: в sign() заменить секрет на константу — подпись перестаёт быть общим секретом
    const forged = forgeWithPayload('secret-of-the-attacker-000000000000', {
      sub: 'tg:364943522',
      role: 'admin',
      purpose: 'webapp-entry',
      exp: Math.floor(ISSUED_AT.getTime() / 1000) + 300,
      bindings: { telegramId: '364943522' },
    });

    expect(webappAcceptsEntryToken(forged, secretState.value)).toBeNull();
  });

  it('дано: секрет подписи не задан → когда строим ссылку → тогда ссылки НЕТ (а не неподписанная ссылка)', () => {
    // арбитр: убрать `|| !secret` из условия раннего возврата
    secretState.value = '';

    expect(buildWebappEntryTokenFromSource({ source: 'telegram', chatId: 1 }, APP_BASE)).toBeNull();
    expect(buildWebappEntryUrl({ chatId: 1 }, APP_BASE)).toBeNull();
    expect(buildWebappEntryUrlForMax({ maxId: '1' }, APP_BASE)).toBeNull();
  });

  it('дано: базовый URL приложения не настроен → когда строим ссылку → тогда ссылки НЕТ', () => {
    // арбитр: убрать `!effectiveAppBaseUrl(appBaseUrlOverride)` из условия раннего возврата
    expect(buildWebappEntryUrl({ chatId: 1 }, null)).toBeNull();
    expect(buildWebappEntryUrl({ chatId: 1 }, '   ')).toBeNull();
  });
});

describe('привязка к источнику: токен одного канала не работает как токен другого', () => {
  it('дано: человек пришёл из MAX → тогда в токене только maxId и sub max:, telegram-привязки НЕТ', () => {
    // арбитр: в resolveRoleAndBindings ветке max вернуть `bindings: { telegramId: params.maxId }`
    const payload = readTokenPayload(tokenFor('max'));

    expect(payload.sub).toBe('max:207278131');
    expect(payload.bindings).toEqual({ maxId: '207278131' });
    expect(payload.bindings?.telegramId).toBeUndefined();
  });

  it('дано: человек пришёл из Telegram → тогда в токене только telegramId и sub tg:, max-привязки НЕТ', () => {
    // арбитр: в ветке telegram вернуть sub `max:${chatId}` или добавить maxId в bindings
    const payload = readTokenPayload(tokenFor('telegram'));

    expect(payload.sub).toBe('tg:364943522');
    expect(payload.bindings).toEqual({ telegramId: '364943522' });
    expect(payload.bindings?.maxId).toBeUndefined();
  });

  it('дано: один и тот же числовой id в MAX и в Telegram → тогда это РАЗНЫЕ идентичности, не один человек', () => {
    // арбитр: sub без префикса канала (`String(chatId)` / `params.maxId`) — два разных человека
    // с совпавшими id схлопнутся в один аккаунт вебаппа
    const tg = readTokenPayload(
      buildWebappEntryTokenFromSource({ source: 'telegram', chatId: 207278131 }, APP_BASE)!,
    );
    const max = readTokenPayload(tokenFor('max'));

    expect(tg.sub).not.toBe(max.sub);
  });

  it('дано: источник max → когда строим ссылку → тогда путь /app/max; источник telegram → /app/tg', () => {
    // арбитр: в buildWebappEntryUrlFromSource вернуть '/app/tg' для обоих источников
    const maxUrl = buildWebappEntryUrlFromSource(
      { source: 'max', maxId: '207278131' },
      APP_BASE,
    ) as string;
    const tgUrl = buildWebappEntryUrlFromSource(
      { source: 'telegram', chatId: 364943522 },
      APP_BASE,
    ) as string;

    expect(new URL(maxUrl).pathname).toBe('/app/max');
    expect(new URL(tgUrl).pathname).toBe('/app/tg');
  });

  it('дано: ссылка отдана человеку → когда вебапп читает из неё параметр t → тогда это рабочий токен входа', () => {
    // арбитр: в buildWebappEntryUrlFromSource вернуть `${baseUrl}${entryPath}` без `?t=${token}`
    // (человек получает ссылку, по которой в аккаунт не попадает вовсе)
    const url = buildWebappEntryUrlFromSource({ source: 'max', maxId: '207278131' }, APP_BASE)!;
    const fromUrl = new URL(url).searchParams.get('t') ?? '';

    expect(webappAcceptsEntryToken(fromUrl, secretState.value)?.sub).toBe('max:207278131');
  });
});

describe('роль в токене: незнакомец не может выписать себе админа', () => {
  it('дано: вход из Telegram с id, совпавшим с TELEGRAM_ADMIN_ID → тогда роль всё равно client', () => {
    // C-4 (docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): роль из этого токена — единственный вход
    // в INSERT platform_users(role) для новой привязки. 364943522 — значение TELEGRAM_ADMIN_ID
    // из vitest.setup.ts, т.е. ровно тот случай, ради которого правило и вводилось.
    // арбитр: вернуть `role: chatId === adminId ? 'admin' : 'client'` в resolveRoleAndBindings
    expect(readTokenPayload(tokenFor('telegram')).role).toBe('client');
    expect(readTokenPayload(tokenFor('max')).role).toBe('client');
  });

  it('дано: интеграторский id человека передан → тогда он в токене, и вебапп резолвит канон по нему', () => {
    // арбитр: перестать класть integratorUserId в payload — вебапп потеряет связь с каноном
    // и заведёт человеку второй аккаунт
    const token = buildWebappEntryTokenFromSource(
      { source: 'telegram', chatId: 364943522, integratorUserId: ' 1201 ' },
      APP_BASE,
    )!;

    expect(readTokenPayload(token).integratorUserId).toBe('1201');
  });

  it('дано: интеграторский id пустой/пробельный → тогда поля в токене нет (а не пустая строка)', () => {
    // арбитр: убрать проверку `trim() !== ''` — вебапп получит integratorUserId: '' и попробует
    // резолвить канон по пустому ключу
    const token = buildWebappEntryTokenFromSource(
      { source: 'telegram', chatId: 364943522, integratorUserId: '   ' },
      APP_BASE,
    )!;

    expect('integratorUserId' in readTokenPayload(token)).toBe(false);
  });
});
