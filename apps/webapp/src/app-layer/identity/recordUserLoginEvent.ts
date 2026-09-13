import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { logger } from '@/infra/logging/logger';
import { identitySessionRef } from '@/infra/identityBoundaryAudit';
import { lookupLoginCountry } from '@/infra/loginCountry';
import { appendUserLoginEvent, type UserLoginEventAppended } from '@/infra/userLoginEvents';

export type RecordUserLoginEventInput = {
  userId: string;
  issuedAtSeconds: number;
  method: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  host: string | null;
  /** Device marker cookie carried by the browser, or null when it is absent. */
  deviceId: string | null;
};

/**
 * Country is resolved HERE, not at the screen, and stored with the row: the answer is the one we had
 * at the moment of the login. The offline directory is refreshed over time, and a login from a year
 * ago must not silently change country because an address block was reassigned since.
 */
function resolveCountry(ip: string | null): string | null {
  if (!ip) return null;
  try {
    return lookupLoginCountry(ip);
  } catch (err) {
    logger.warn({ err }, 'login country lookup failed, country left unknown');
    return null;
  }
}

export type RecordedUserLoginEvent = UserLoginEventAppended & {
  /** Та же страна, что легла в строку журнала, — не пересчитанная заново. */
  country: string | null;
};

/**
 * Journal failure is deliberately best-effort: authentication must still complete.
 *
 * Возвращает `null`, когда записать не удалось. Это НЕ то же самое, что «устройство знакомое»:
 * не зная, знакомо оно или нет, письмо о новом месте отправлять нельзя — ни отправить наугад, ни
 * промолчать наугад. Отказ уходит в лог, и решение принимает вызывающий, видя `null`.
 */
export async function recordUserLoginEvent(
  input: RecordUserLoginEventInput,
): Promise<RecordedUserLoginEvent | null> {
  try {
    // Страна считается ОДИН раз и уходит наружу вместе с результатом. Посчитай её второй раз для
    // письма — и письмо смогло бы назвать страну, которой нет в строке журнала: справочник
    // переиздаётся, а разбирающий случай человек сверяет письмо со строкой.
    const country = resolveCountry(input.ip);
    const appended = await runWithDbBootstrapPrincipal(
      { source: 'user-login-event/session-start' },
      () =>
        appendUserLoginEvent({
          ...input,
          sessionRef: identitySessionRef(input.userId, input.issuedAtSeconds),
          country,
        }),
    );
    return { ...appended, country };
  } catch (err) {
    logger.error({ err, reason: String(err), method: input.method }, 'user login event was not recorded');
    return null;
  }
}
