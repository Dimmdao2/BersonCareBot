import { createHmac } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/infra/logging/logger';
import { isClientBootReportRateLimitedByKey } from '@/modules/auth/authRateLimits';
import { resolveRealIpRateLimitClientKey } from '@/modules/auth/realIpRateLimitClientKey';

const SCOPE = 'patient_client_env';
export const CLIENT_BOOT_REPORT_FALLBACK_CLIENT_KEY = 'client_boot_report:missing_x_real_ip';

/**
 * Purpose-separated pseudonym for the short-lived F0 limiter bucket.
 * SESSION_COOKIE_SECRET rotation intentionally rotates the pseudonym and may reset this non-security quota once.
 */
export function pseudonymizeClientBootRateLimitKey(rawClientKey: string): string | null {
  const secret = env.SESSION_COOKIE_SECRET?.trim() ?? '';
  if (secret.length < 16) return null;
  const digest = createHmac('sha256', secret)
    .update(`patient-client-boot-rate-limit:v1:${rawClientKey}`)
    .digest('hex');
  return `client-boot:v1:${digest}`;
}

export function resolveClientBootReportRateLimitClientKey(request: Request) {
  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: SCOPE,
    logPrefix: 'unsupported_client_boot',
    fallbackKey: CLIENT_BOOT_REPORT_FALLBACK_CLIENT_KEY,
    productionMissingLogLevel: 'warn',
    event: 'unsupported_client_boot',
  });
  if (!identity.ok) return identity;
  const key = pseudonymizeClientBootRateLimitKey(identity.key);
  if (!key) {
    logger.warn({
      msg: 'unsupported_client_boot_pseudonymization_secret_required',
      scope: SCOPE,
      event: 'unsupported_client_boot',
      reason: 'missing_pseudonymization_secret',
    });
    return { ok: false as const, reason: 'missing_pseudonymization_secret' as const };
  }
  return { ok: true as const, key };
}

export async function checkClientBootReportRateLimit(
  request: Request,
): Promise<'ok' | 'rate_limited' | 'configuration_error'> {
  const identity = resolveClientBootReportRateLimitClientKey(request);
  if (!identity.ok) return 'configuration_error';
  return (await isClientBootReportRateLimitedByKey(identity.key)) ? 'rate_limited' : 'ok';
}
