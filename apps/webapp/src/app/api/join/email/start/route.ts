import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { readPatientInviteContinuationCookie } from '@/modules/patient-invites/continuationCookie';
import { checkPatientInvitePublicRateLimit } from '@/modules/patient-invites/rateLimit';

const bodySchema = z.object({ email: z.string().min(1).max(320) }).strict();

function response(body: Record<string, unknown>, status = 200, retryAfter?: number): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('Referrer-Policy', 'no-referrer');
  if (retryAfter != null) result.headers.set('Retry-After', String(retryAfter));
  return result;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/join/email/start:POST');
  if (!(await isAuthChannelEnabled('email'))) {
    return response({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, 503);
  }
  const continuation = await readPatientInviteContinuationCookie();
  if (!continuation) return response({ ok: false, error: 'invalid_continuation' }, 400);
  ensureAuthModulePortsBound();
  const limit = await checkPatientInvitePublicRateLimit(request, 'email_start', continuation);
  if (limit === 'proxy_configuration') return response({ ok: false, error: limit }, 503);
  if (limit === 'rate_limited') return response({ ok: false, error: limit }, 429, 60);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ ok: false, error: 'invalid_email' }, 400);

  const result = await buildAppDeps().patientInvites.startEmailProof(
    continuation,
    parsed.data.email,
  );
  if (!result.ok) {
    const retryAfter = 'retryAfterSeconds' in result ? result.retryAfterSeconds : undefined;
    const status = result.code === 'rate_limited' ? 429 : 400;
    return response(
      { ok: false, error: result.code, retryAfterSeconds: retryAfter },
      status,
      retryAfter,
    );
  }
  return response({ ok: true, retryAfterSeconds: result.retryAfterSeconds });
}
