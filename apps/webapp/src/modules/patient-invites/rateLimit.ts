import { createHash } from 'node:crypto';
import {
  isPatientInviteEmailConfirmRateLimitedByKey,
  isPatientInviteEmailStartRateLimitedByKey,
  isPatientInviteExchangeRateLimitedByKey,
} from '@/modules/auth/authRateLimits';
import { resolveRealIpRateLimitClientKey } from '@/modules/auth/realIpRateLimitClientKey';

type PatientInviteRateLimitKind = 'exchange' | 'email_start' | 'email_confirm';

const limiters = {
  exchange: isPatientInviteExchangeRateLimitedByKey,
  email_start: isPatientInviteEmailStartRateLimitedByKey,
  email_confirm: isPatientInviteEmailConfirmRateLimitedByKey,
} satisfies Record<PatientInviteRateLimitKind, (key: string) => Promise<boolean>>;

function artifactKey(kind: PatientInviteRateLimitKind, artifact: string): string {
  return `${kind}:artifact:${createHash('sha256').update(artifact).digest('hex')}`;
}

export async function checkPatientInvitePublicRateLimit(
  request: Request,
  kind: PatientInviteRateLimitKind,
  artifact: string,
): Promise<'ok' | 'rate_limited' | 'proxy_configuration'> {
  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: `patient_invite.${kind}`,
    logPrefix: `patient_invite_${kind}`,
    fallbackKey: `patient_invite_${kind}:missing_x_real_ip`,
  });
  if (!identity.ok) return 'proxy_configuration';
  const limiter = limiters[kind];
  const [ipLimited, artifactLimited] = await Promise.all([
    limiter(`${kind}:ip:${identity.key}`),
    limiter(artifactKey(kind, artifact)),
  ]);
  return ipLimited || artifactLimited ? 'rate_limited' : 'ok';
}
