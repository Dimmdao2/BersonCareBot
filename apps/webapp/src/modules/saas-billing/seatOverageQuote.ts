import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

const VERSION = 'sq1';

/**
 * Владелец 19.08 — про прежнюю форму, где сумму присылал браузер: «это настолько бредово что даже
 * смешно», и про её переименование: «„показанная цена“ тоже какая то хня кривая».
 *
 * Решение: цену выпускает сервер. Он выдаёт КОТИРОВКУ — свою запись о том, что именно, кому, почём
 * и до какого момента он готов продать, — а браузер возвращает только её. Денежное значение из
 * браузера не приходит НИКОГДА: `verifySeatOverageQuote` берёт цену из подписи, а не из тела запроса.
 *
 * Котировка подписана, а не сохранена в таблице. Причина не в экономии миграции: у неоплаченных
 * котировок нет владельца, который их удалит, а репозиторий только что нашёл шесть таблиц, уборка
 * которых не работала никогда (`docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md`). Подписанная
 * котировка истекает сама, хранить нечего и чистить нечего. Тот же приём и тот же секрет уже несут
 * OAuth-state (`modules/auth/oauthSignedState.ts`) — это не новая сущность, а тот же идиом.
 *
 * Цена этого выбора: подписанную котировку нельзя «погасить» в хранилище. Однократность здесь
 * обеспечивается не гашением, а тем, что котировка НЕСЁТ личность покупки (`k`), из которой уже
 * сегодня выводится ключ идемпотентности провайдера. Повтор той же котировки — повтор того же
 * ключа, то есть тот же счёт, а не второй. Второй счёт требует новой котировки.
 */
export type SeatOverageQuote = {
  organizationId: string;
  /** Личность покупки. Из неё выводится `providerIdempotencyKey` — второго механизма нет. */
  purchaseKey: string;
  priceMinor: number;
  currency: string;
  expiresAt: string;
};

const QUOTE_TTL_MS = 15 * 60 * 1000;

/**
 * Срок жизни котировки — минимум из пятнадцати минут и момента, в который цена перестаёт быть
 * верной.
 *
 * Это не про аккуратность, а про правильность: цена места считается целыми сутками остатка,
 * отсчитанными назад от конца оплаченного периода, и меняется ровно на границе таких суток.
 * Котировка, пережившая границу, обещала бы прежнюю — то есть большую — цену за более короткий
 * остаток.
 *
 * Сам этот момент файл НЕ считает: `priceStableUntil` приходит из того же предложения единственной
 * двери (`seatOverage.ts`), что и цена. Своя копия календаря здесь означала бы вторую копию
 * правила Р-15 — ровно тот разъезд, из-за которого работа и делалась.
 *
 * Пятнадцать минут — верхняя граница: столько нужно человеку, чтобы прочитать цену, решить и
 * нажать, включая возврат через ветку «место освободилось». Это НЕ срок оплаты счёта — у счёта
 * свой `expiresAt` (заданная длительность от выставления); котировке достаточно дожить до клика.
 */
function quoteExpiresAtMs(nowMs: number, priceStableUntil: string): number {
  const priceStableUntilMs = Date.parse(priceStableUntil);
  if (!Number.isFinite(priceStableUntilMs)) throw new Error('seat_overage_price_window_invalid');
  return Math.min(nowMs + QUOTE_TTL_MS, priceStableUntilMs);
}

function requireSigningSecret(): string {
  const secret = env.SESSION_COOKIE_SECRET ?? '';
  if (secret.length < 16) {
    throw new Error('SESSION_COOKIE_SECRET is required for seat overage quotes');
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Buffer {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function hmacSha256(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message, 'utf8').digest();
}

type Payload = {
  org: string;
  k: string;
  amt: number;
  cur: string;
  exp: number;
};

/** Выпуск котировки. Единственное место, где цена становится обещанием сервера. */
export function issueSeatOverageQuote(input: {
  organizationId: string;
  priceMinor: number;
  currency: string;
  /** Момент, до которого цена неподвижна, — из предложения двери, вместе с ценой (Р-15). */
  priceStableUntil: string;
  nowMs?: number;
}): { token: string; expiresAt: string } {
  const expiresAtMs = quoteExpiresAtMs(input.nowMs ?? Date.now(), input.priceStableUntil);
  const payload: Payload = {
    org: input.organizationId,
    k: randomUUID(),
    amt: input.priceMinor,
    cur: input.currency,
    exp: expiresAtMs,
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const macInput = `${VERSION}.${payloadB64}`;
  const sigB64 = base64UrlEncode(hmacSha256(requireSigningSecret(), macInput));
  return {
    token: `${VERSION}.${payloadB64}.${sigB64}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/**
 * Проверка котировки. `null` — подделана, просрочена или выписана другой организации; во всех трёх
 * случаях покупка не состоится и экран запрашивает цену заново.
 */
export function verifySeatOverageQuote(
  token: string,
  expected: { organizationId: string },
  nowMs: number = Date.now(),
): SeatOverageQuote | null {
  let secret: string;
  try {
    secret = requireSigningSecret();
  } catch {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = hmacSha256(secret, `${VERSION}.${payloadB64}`);
  let gotSig: Buffer;
  try {
    gotSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  if (gotSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(gotSig, expectedSig)) return null;

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payloadRaw || typeof payloadRaw !== 'object') return null;
  const { org, k, amt, cur, exp } = payloadRaw as Record<string, unknown>;
  if (
    typeof org !== 'string' ||
    typeof k !== 'string' ||
    !k ||
    typeof amt !== 'number' ||
    !Number.isSafeInteger(amt) ||
    amt < 0 ||
    typeof cur !== 'string' ||
    !/^[A-Z]{3}$/.test(cur) ||
    typeof exp !== 'number'
  ) {
    return null;
  }
  if (nowMs >= exp) return null;
  // Котировка выписана конкретной клинике: чужая подпись валидна, но покупка — не её.
  if (org !== expected.organizationId) return null;

  return {
    organizationId: org,
    purchaseKey: k,
    priceMinor: amt,
    currency: cur,
    expiresAt: new Date(exp).toISOString(),
  };
}

export type SeatOverageQuoteBody = {
  error: 'seat_overage_confirmation_required';
  quote: string;
  priceMinor: number;
  currency: string;
  quoteExpiresAt: string;
};

/**
 * Единственное место, где цена дополнительного места уходит на провод. Оба входа — отказ
 * приглашения по лимиту и повторная сверка при покупке — строят тело 402 здесь, поэтому цена
 * физически не может уйти на экран без котировки, которой она подтверждается обратно.
 * `priceMinor`/`currency` рядом с токеном — то, что рисуется человеку; сервер их обратно не читает.
 */
export function seatOverageQuoteBody(input: {
  organizationId: string;
  priceMinor: number;
  currency: string;
  priceStableUntil: string;
}): SeatOverageQuoteBody {
  const quote = issueSeatOverageQuote(input);
  return {
    error: 'seat_overage_confirmation_required',
    quote: quote.token,
    priceMinor: input.priceMinor,
    currency: input.currency,
    quoteExpiresAt: quote.expiresAt,
  };
}
