import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  createChallenge,
  randomInt,
  verifySolution,
  type Challenge,
  type Payload,
} from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { z } from 'zod';
import { logger } from '@/infra/logging/logger';
import { passwordIdentifierKey, type PasswordAltchaProof } from './passwordLoginProtection';
import type {
  PasswordCaptchaChallenge,
  PasswordLoginProtectionPort,
} from './passwordLoginProtectionPort';

const MAX_PAYLOAD_LENGTH = 32_768;
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const PURPOSE = 'password_login';

const payloadSchema = z.object({
  challenge: z.object({
    parameters: z.object({
      algorithm: z.string(),
      nonce: z.string(),
      salt: z.string(),
      cost: z.number().int(),
      keyLength: z.number().int(),
      keyPrefix: z.string(),
      expiresAt: z.number().int(),
      data: z.object({
        challengeId: z.string().uuid(),
        purpose: z.literal(PURPOSE),
        identifierKey: z.string().regex(/^password-email:v1:[0-9a-f]{64}$/),
      }),
    }),
    signature: z.string(),
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: z.string(),
    time: z.number().optional(),
  }),
});

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function challengeDigest(challenge: Challenge): string {
  return createHash('sha256').update(stableJson(challenge)).digest('hex');
}

function signatureSecret(rootSecret: string): string {
  return createHmac('sha256', rootSecret).update('password-altcha:signature:v1').digest('hex');
}

function decodePayload(rawPayload: string): Payload | null {
  if (rawPayload.length === 0 || rawPayload.length > MAX_PAYLOAD_LENGTH) return null;
  try {
    const decoded = Buffer.from(rawPayload, 'base64').toString('utf8');
    if (decoded.length > MAX_PAYLOAD_LENGTH) return null;
    const parsed = payloadSchema.safeParse(JSON.parse(decoded) as unknown);
    return parsed.success ? (parsed.data as Payload) : null;
  } catch {
    return null;
  }
}

export type PasswordCaptchaVerification = {
  altchaProof?: PasswordAltchaProof;
  verifiedExternally: boolean;
  /**
   * Поставщик капчи не ответил (таймаут, обрыв, не-200). Это НЕ «капча не пройдена»: попытка
   * вообще не состоялась, и маршрут обязан отказать ДО двери входа, чтобы молчание чужой стороны
   * не съело человеку попытку и не приблизило его к паузе. Решение владельца 14.09: «значит не
   * пускать».
   */
  providerUnavailable?: boolean;
};

async function readCaptchaConfig(port: PasswordLoginProtectionPort) {
  return port.readCaptchaConfig
    ? port.readCaptchaConfig()
    : { provider: 'altcha' as const, yandexClientKey: null, yandexServerKey: null };
}

/**
 * Адрес человека Яндексу передаётся, только если это действительно адрес. В обычной работе сюда
 * приходит доверенный `x-real-ip` от nginx, но на dev-стенде его нет и общий резолвер возвращает
 * СЛОВО-заглушку вместо адреса. Слать её как `ip` — значит врать чужой стороне о происхождении
 * попытки; параметр необязательный, поэтому в таком случае он просто не ставится.
 */
function asIpAddress(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 45) return null;
  const looksLikeIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate);
  const looksLikeIpv6 = candidate.includes(':') && /^[0-9a-fA-F:.]+$/.test(candidate);
  return looksLikeIpv4 || looksLikeIpv6 ? candidate : null;
}

/**
 * Ждём ответ Яндекса три секунды. Числа в документации Яндекса нет — это НАШЕ значение. Оно
 * выбрано не под терпение человека (галочку он ставит дольше), а под время ответа чужого сервиса:
 * секунды хватает в норме, но одна медленная сеть превращала бы её в отказ на ровном месте. Повтора
 * нет: токен одноразовый, второй запрос с тем же токеном Яндекс уже не примет.
 */
const YANDEX_VERIFY_TIMEOUT_MS = 3_000;

type YandexVerdict = 'ok' | 'failed' | 'unavailable';

async function verifyYandexToken(
  serverKey: string,
  token: string,
  ip: string | null,
): Promise<YandexVerdict> {
  const address = asIpAddress(ip);
  const body = new URLSearchParams({ secret: serverKey, token, ...(address ? { ip: address } : {}) });
  try {
    const response = await fetch('https://smartcaptcha.cloud.yandex.ru/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(YANDEX_VERIFY_TIMEOUT_MS),
    });
    // Яндекс рекомендует считать не-200 успехом, «чтобы не было задержки». Мы так НЕ делаем:
    // капча появляется только с третьей попытки подряд, то есть ровно тогда, когда кто-то
    // перебирает пароли. Пропускать в этот момент — значит снимать защиту в единственный момент,
    // когда она работает. Обычный вход молчание Яндекса не задевает вовсе. Решение владельца
    // 14.09: «значит не пускать»; OWASP относит fail-open к дефектам обработки ошибок.
    if (!response.ok) {
      logger.warn({
        msg: 'password_captcha_provider_unavailable',
        provider: 'yandex',
        reason: 'http_status',
        status: response.status,
      });
      return 'unavailable';
    }
    const parsed = z
      .object({ status: z.enum(['ok', 'failed']), message: z.string().optional() })
      .safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      logger.warn({
        msg: 'password_captcha_provider_unavailable',
        provider: 'yandex',
        reason: 'unreadable_response',
      });
      return 'unavailable';
    }
    return parsed.data.status === 'ok' ? 'ok' : 'failed';
  } catch (error) {
    // Таймаут или обрыв связи. Разобранный ответ `status: "failed"` выше — это НЕ сюда: там капча
    // честно не пройдена, и попытка засчитывается как обычно.
    logger.warn({
      msg: 'password_captcha_provider_unavailable',
      provider: 'yandex',
      reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'transport',
      timeoutMs: YANDEX_VERIFY_TIMEOUT_MS,
    });
    return 'unavailable';
  }
}

export function createPasswordAltchaService(port: PasswordLoginProtectionPort) {
  return {
    async issue(emailNormalized: string): Promise<PasswordCaptchaChallenge | null> {
      const config = await readCaptchaConfig(port);
      if (config.provider === 'yandex') {
        return config.yandexClientKey && config.yandexServerKey
          ? { provider: 'yandex', clientKey: config.yandexClientKey }
          : null;
      }
      const rootSecret = await port.readAltchaRootSecret();
      if (!rootSecret) return null;

      const challengeId = randomUUID();
      const identifierKey = passwordIdentifierKey(emailNormalized);
      const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);
      const challenge = await createChallenge({
        algorithm: 'PBKDF2/SHA-256',
        cost: 5_000,
        counter: randomInt(10_000, 5_000),
        deriveKey,
        expiresAt,
        hmacSignatureSecret: signatureSecret(rootSecret),
        data: {
          challengeId,
          purpose: PURPOSE,
          identifierKey,
        },
      });
      const issued = await port.registerAltchaChallenge({
        emailNormalized,
        challengeId,
        challengeDigest: challengeDigest(challenge),
        expiresAt,
      });
      return issued ? { provider: 'altcha', challenge, expiresAt: expiresAt.toISOString() } : null;
    },

    async verify(
      emailNormalized: string,
      answer: string | undefined,
      ip: string | null,
    ): Promise<PasswordCaptchaVerification | undefined> {
      // Ответа нет — и спрашивать настройки незачем: решение «капчу не проходили» одинаково при
      // любом поставщике. Вход по паролю зовёт эту проверку КАЖДЫЙ раз, в том числе при выключенной
      // капче, и лишний поход в базу на каждой попытке здесь не нужен ни за чем.
      if (!answer) return { verifiedExternally: false };
      const config = await readCaptchaConfig(port);
      if (config.provider === 'yandex') {
        if (!config.yandexServerKey || !config.yandexClientKey) {
          return { verifiedExternally: false };
        }
        const verdict = await verifyYandexToken(config.yandexServerKey, answer, ip);
        return {
          verifiedExternally: verdict === 'ok',
          ...(verdict === 'unavailable' ? { providerUnavailable: true } : {}),
        };
      }
      const rawPayload = answer;
      const payload = decodePayload(rawPayload);
      if (!payload) return { verifiedExternally: false };
      const data = payload.challenge.parameters.data;
      if (
        data?.purpose !== PURPOSE ||
        data.identifierKey !== passwordIdentifierKey(emailNormalized) ||
        typeof data.challengeId !== 'string'
      ) {
        return { verifiedExternally: false };
      }

      const rootSecret = await port.readAltchaRootSecret();
      if (!rootSecret) return { verifiedExternally: false };
      const result = await verifySolution({
        challenge: payload.challenge,
        solution: payload.solution,
        deriveKey,
        hmacSignatureSecret: signatureSecret(rootSecret),
      });
      if (!result.verified) return { verifiedExternally: false };
      return {
        altchaProof: {
          challengeId: data.challengeId,
          challengeDigest: challengeDigest(payload.challenge),
        },
        verifiedExternally: false,
      };
    },
  };
}

export type PasswordAltchaService = ReturnType<typeof createPasswordAltchaService>;
