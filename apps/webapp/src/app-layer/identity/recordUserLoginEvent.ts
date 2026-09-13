import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { logger } from '@/infra/logging/logger';
import { identitySessionRef } from '@/infra/identityBoundaryAudit';
import { lookupLoginCountry } from '@/infra/loginCountry';
import { appendUserLoginEvent } from '@/infra/userLoginEvents';

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

/** Journal failure is deliberately best-effort: authentication must still complete. */
export async function recordUserLoginEvent(input: RecordUserLoginEventInput): Promise<void> {
  try {
    await runWithDbBootstrapPrincipal({ source: 'user-login-event/session-start' }, () =>
      appendUserLoginEvent({
        ...input,
        sessionRef: identitySessionRef(input.userId, input.issuedAtSeconds),
        country: resolveCountry(input.ip),
      }),
    );
  } catch (err) {
    logger.error({ err, method: input.method }, 'user login event was not recorded');
  }
}
