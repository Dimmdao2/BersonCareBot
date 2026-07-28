import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { setSessionFromUser } from '@/modules/auth/service';
import {
  clearPatientInviteContinuationCookie,
  readPatientInviteContinuationCookie,
} from '@/modules/patient-invites/continuationCookie';
import { PATIENT_ORGANIZATION_PREFERENCE_COOKIE } from '@/modules/patient-organization/preference';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import { checkPatientInvitePublicRateLimit } from '@/modules/patient-invites/rateLimit';

const bodySchema = z
  .object({
    email: z.string().min(1).max(320),
    code: z.string().trim().min(1).max(12),
  })
  .strict();

function response(body: Record<string, unknown>, status = 200, retryAfter?: number): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('Referrer-Policy', 'no-referrer');
  if (retryAfter != null) result.headers.set('Retry-After', String(retryAfter));
  return result;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/join/email/confirm:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return response({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, 503);
  }
  const continuation = await readPatientInviteContinuationCookie();
  if (!continuation) return response({ ok: false, error: 'invalid_continuation' }, 400);
  ensureAuthModulePortsBound();
  const limit = await checkPatientInvitePublicRateLimit(request, 'email_confirm', continuation);
  if (limit === 'proxy_configuration') return response({ ok: false, error: limit }, 503);
  if (limit === 'rate_limited') return response({ ok: false, error: limit }, 429, 60);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ ok: false, error: 'invalid_code' }, 400);

  const deps = buildAppDeps();
  const proof = await deps.patientInvites.verifyEmailProof(
    continuation,
    parsed.data.email,
    parsed.data.code,
  );
  if (!proof.ok) {
    const status = proof.code === 'too_many_attempts' ? 429 : 400;
    return response({ ok: false, error: proof.code }, status);
  }

  const inviteState = await deps.patientInvites.lookupContinuation(continuation);
  if (!inviteState.ok) {
    return response({ ok: false, error: inviteState.code }, 400);
  }
  const emailNormalized = normalizeEmail(parsed.data.email);
  let patientUserId: string;
  let organizationId: string;
  if (inviteState.preview.recipientBinding === 'unbound_email_claim') {
    const claimed = await deps.patientInvites.claimUnboundEmailProof(continuation, emailNormalized);
    if (!claimed.ok) {
      const status = claimed.code === 'conflicting_identity' ? 409 : 400;
      return response({ ok: false, error: claimed.code }, status);
    }
    patientUserId = claimed.patientUserId;
    organizationId = claimed.organizationId;
  } else {
    const identity = await deps.emailOtpPublicDb.findPublicEmailUser(emailNormalized);
    if (!identity || !isPlatformUserUuid(identity.userId)) {
      return response({ ok: false, error: 'wrong_recipient' }, 400);
    }
    enterStaffSecuritySelfPrincipal(identity.userId, 'api/join/email/confirm:otp-verified-patient');
    const redeemed = await deps.patientInvites.redeemEmailProof(continuation, identity.userId);
    if (!redeemed.ok) {
      const status = redeemed.code === 'conflicting_identity' ? 409 : 400;
      return response({ ok: false, error: redeemed.code }, status);
    }
    patientUserId = identity.userId;
    organizationId = redeemed.organizationId;
  }

  if (!isPlatformUserUuid(patientUserId)) {
    return response({ ok: false, error: 'server_error' }, 500);
  }
  enterStaffSecuritySelfPrincipal(patientUserId, 'api/join/email/confirm:claimed-patient');
  const user = await deps.userByPhone.findByUserId(patientUserId);
  if (!user || user.role !== 'client') {
    return response({ ok: false, error: 'server_error' }, 500);
  }

  await setSessionFromUser(user);
  (await cookies()).set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  await clearPatientInviteContinuationCookie();
  return response({ ok: true, redirectTo: routePaths.patient });
}
