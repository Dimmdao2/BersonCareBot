import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
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
  stampBootstrapPrincipal('api/join/email/confirm:POST');
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

  const identity = await deps.emailOtpPublicDb.findPublicEmailUser(
    normalizeEmail(parsed.data.email),
  );
  if (!identity || !isPlatformUserUuid(identity.userId)) {
    return response({ ok: false, error: 'wrong_recipient' }, 400);
  }
  enterStaffSecuritySelfPrincipal(identity.userId, 'api/join/email/confirm:otp-verified-patient');
  const user = await deps.userByPhone.findByUserId(identity.userId);
  if (!user || user.role !== 'client') {
    return response({ ok: false, error: 'server_error' }, 500);
  }

  const result = await deps.patientInvites.redeemEmailProof(continuation, identity.userId);
  if (!result.ok) {
    const status = result.code === 'conflicting_identity' ? 409 : 400;
    return response({ ok: false, error: result.code }, status);
  }
  await setSessionFromUser(user);
  (await cookies()).set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, result.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  await clearPatientInviteContinuationCookie();
  return response({ ok: true, redirectTo: routePaths.patient });
}
