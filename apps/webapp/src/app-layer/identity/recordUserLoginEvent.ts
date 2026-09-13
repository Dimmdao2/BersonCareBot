import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { logger } from '@/infra/logging/logger';
import { identitySessionRef } from '@/infra/identityBoundaryAudit';
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
};

/** Journal failure is deliberately best-effort: authentication must still complete. */
export async function recordUserLoginEvent(input: RecordUserLoginEventInput): Promise<void> {
  try {
    await runWithDbBootstrapPrincipal({ source: 'user-login-event/session-start' }, () =>
      appendUserLoginEvent({
        ...input,
        sessionRef: identitySessionRef(input.userId, input.issuedAtSeconds),
      }),
    );
  } catch (err) {
    logger.error({ err, method: input.method }, 'user login event was not recorded');
  }
}
