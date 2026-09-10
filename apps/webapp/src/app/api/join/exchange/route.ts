import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { getCurrentSessionForIdentitySelf } from '@/modules/auth/service';
import {
  clearPatientInviteContinuationCookie,
  issuePatientInviteContinuationCookie,
} from '@/modules/patient-invites/continuationCookie';
import { PATIENT_ORGANIZATION_PREFERENCE_COOKIE } from '@/modules/patient-organization/preference';
import { checkPatientInvitePublicRateLimit } from '@/modules/patient-invites/rateLimit';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

const bodySchema = z.object({ bearer: z.string().min(32).max(256) }).strict();

function safeResponse(body: Record<string, unknown>, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/join/exchange:POST', request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return safeResponse({ ok: false, error: 'invalid_token' }, 400);
  ensureAuthModulePortsBound();
  const limit = await checkPatientInvitePublicRateLimit(request, 'exchange', parsed.data.bearer);
  if (limit === 'proxy_configuration') return safeResponse({ ok: false, error: limit }, 503);
  if (limit === 'rate_limited') return safeResponse({ ok: false, error: limit }, 429);

  // Shared exchange chokepoint. U3B registers the patient invite kind first; future invite kinds
  // extend this resolver instead of adding another public join tree.
  const deps = buildAppDeps();
  const result = await deps.patientInvites.exchangeBearer(parsed.data.bearer);
  if (!result.ok) return safeResponse({ ok: false, error: result.code }, 400);

  await issuePatientInviteContinuationCookie(result.continuation);

  // Владелец 10.09: «если он уже залогинен, то у него открывается его кабинет сразу в эту клинику».
  // Просить код из письма у человека, который уже вошёл ЭТИМ ЖЕ аккаунтом, — требовать доказать
  // доказанное. Дверь узкая: принимается только совпадение вошедшего с записью пациента из
  // приглашения; любой другой исход возвращает `unproved_identity`, и человек видит обычный
  // почтовый экран — привязать чужой идентификатор молча нельзя, это слияние двух разных людей.
  const accepted = await acceptWithLiveSession(deps, result.continuation);
  if (accepted) {
    await clearPatientInviteContinuationCookie();
    return safeResponse({ ok: true, kind: result.kind, redirectTo: routePaths.patient });
  }

  return safeResponse({
    ok: true,
    kind: result.kind,
    redirectTo: `/join/${result.continuation}`,
  });
}

/**
 * Возвращает `true`, только если приглашение действительно принято по сессии. Любой отказ здесь —
 * не ошибка запроса, а «этим путём не вышло»: обработчик молча уходит на почтовый экран.
 */
async function acceptWithLiveSession(
  deps: ReturnType<typeof buildAppDeps>,
  continuation: string,
): Promise<boolean> {
  const session = await getCurrentSessionForIdentitySelf();
  const userId = session?.user.userId;
  if (!userId || session.user.role !== 'client' || !isPlatformUserUuid(userId)) return false;

  enterStaffSecuritySelfPrincipal(userId, 'api/join/exchange:live-session-patient');
  const redeemed = await deps.patientInvites.redeemWithSession(continuation, userId);
  if (!redeemed.ok) return false;

  (await cookies()).set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, redeemed.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
