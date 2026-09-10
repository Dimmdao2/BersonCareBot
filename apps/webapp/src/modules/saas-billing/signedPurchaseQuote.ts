import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

const VERSION = 'sq1';

/**
 * ПОДПИСАННАЯ КОТИРОВКА — одна механика на все покупки внутри оплаченного периода.
 *
 * Владелец 19.08 — про прежнюю форму, где сумму присылал браузер: «это настолько бредово что даже
 * смешно», и про её переименование: «„показанная цена“ тоже какая то хня кривая».
 *
 * Решение: цену выпускает сервер. Он выдаёт КОТИРОВКУ — свою запись о том, что именно, кому, почём
 * и до какого момента он готов продать, — а браузер возвращает только её. Денежное значение из
 * браузера не приходит НИКОГДА: проверка берёт цену из подписи, а не из тела запроса.
 *
 * Котировка подписана, а не сохранена в таблице. Причина не в экономии миграции: у неоплаченных
 * котировок нет владельца, который их удалит, а репозиторий уже находил шесть таблиц, уборка
 * которых не работала никогда (`docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md`). Подписанная
 * котировка истекает сама, хранить нечего и чистить нечего. Тот же приём и тот же секрет уже несут
 * OAuth-state (`modules/auth/oauthSignedState.ts`) — это не новая сущность, а тот же идиом.
 *
 * Цена этого выбора: подписанную котировку нельзя «погасить» в хранилище. Однократность здесь
 * обеспечивается не гашением, а тем, что котировка НЕСЁТ личность покупки (`k`), из которой
 * выводится ключ идемпотентности провайдера. Повтор той же котировки — повтор того же ключа, то
 * есть тот же счёт, а не второй. Второй счёт требует новой котировки.
 *
 * `sub` — ЧТО именно продано. Для места это само место, для пакета объёма — его идентификатор.
 * Без него подпись означала бы только «сервер согласен на эту сумму», и цену дешёвого товара
 * можно было бы предъявить к дорогому.
 */
export type SignedPurchaseQuote = {
  organizationId: string;
  subject: string;
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
 * Это не про аккуратность, а про правильность: цена покупки внутри периода считается целыми сутками
 * остатка, отсчитанными назад от конца оплаченного периода, и меняется ровно на границе таких
 * суток. Котировка, пережившая границу, обещала бы прежнюю — то есть большую — цену за более
 * короткий остаток.
 *
 * Сам этот момент файл НЕ считает: `priceStableUntil` приходит из того же предложения единственной
 * двери, что и цена. Своя копия календаря здесь означала бы вторую копию правила Р-15 — ровно тот
 * разъезд, из-за которого работа и делалась.
 *
 * Пятнадцать минут — верхняя граница: столько нужно человеку, чтобы прочитать цену, решить и
 * нажать. Это НЕ срок оплаты счёта — у счёта свой `expiresAt`; котировке достаточно дожить до клика.
 */
function quoteExpiresAtMs(nowMs: number, priceStableUntil: string): number {
  const priceStableUntilMs = Date.parse(priceStableUntil);
  if (!Number.isFinite(priceStableUntilMs)) throw new Error('purchase_price_window_invalid');
  return Math.min(nowMs + QUOTE_TTL_MS, priceStableUntilMs);
}

function requireSigningSecret(): string {
  const secret = env.SESSION_COOKIE_SECRET ?? '';
  if (secret.length < 16) {
    throw new Error('SESSION_COOKIE_SECRET is required for purchase quotes');
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
  sub: string;
  k: string;
  amt: number;
  cur: string;
  exp: number;
};

/** Выпуск котировки. Единственное место, где цена становится обещанием сервера. */
export function issueSignedPurchaseQuote(input: {
  organizationId: string;
  subject: string;
  priceMinor: number;
  currency: string;
  priceStableUntil: string;
  nowMs?: number;
}): { token: string; expiresAt: string } {
  const expiresAtMs = quoteExpiresAtMs(input.nowMs ?? Date.now(), input.priceStableUntil);
  const payload: Payload = {
    org: input.organizationId,
    sub: input.subject,
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
 * Проверка котировки. `null` — подделана, просрочена, выписана другой организации или на другой
 * товар; во всех случаях покупка не состоится и экран запрашивает цену заново.
 */
export function verifySignedPurchaseQuote(
  token: string,
  expected: { organizationId: string; subject: string },
  nowMs: number = Date.now(),
): SignedPurchaseQuote | null {
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
  const { org, sub, k, amt, cur, exp } = payloadRaw as Record<string, unknown>;
  if (
    typeof org !== 'string' ||
    typeof sub !== 'string' ||
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
  // Котировка выписана конкретной клинике и на конкретный товар: чужая подпись валидна, но покупка
  // — не её, и не этого.
  if (org !== expected.organizationId) return null;
  if (sub !== expected.subject) return null;

  return {
    organizationId: org,
    subject: sub,
    purchaseKey: k,
    priceMinor: amt,
    currency: cur,
    expiresAt: new Date(exp).toISOString(),
  };
}
