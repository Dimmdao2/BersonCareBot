import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  findPasskeyUserById,
  finishPatientPasskeyAuthentication,
} from '@/app-layer/auth/passkeyRuntime';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { recordAuthLogin } from '@/app-layer/product-analytics/recordAuthLogin';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import { prepareVerifiedPrimaryLogin } from '@/modules/auth/verifiedStaffPrimaryLogin';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { checkAuthConfirmRateLimit } from '@/modules/auth/authConfirmRateLimit';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';

const responseSchema = z
  .object({
    id: z.string().min(16).max(1024),
    rawId: z.string().min(16).max(1024),
    type: z.literal('public-key'),
    response: z
      .object({
        clientDataJSON: z.string().min(16),
        authenticatorData: z.string().min(16),
        signature: z.string().min(16),
        userHandle: z.string().min(16).max(1024),
      })
      .passthrough(),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    authenticatorAttachment: z.string().nullable().optional(),
  })
  .passthrough();

const bodySchema = z.object({
  challengeId: z.uuid(),
  response: responseSchema,
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/passkey/login/verify:POST', request);
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: 'Вход по ключу доступа отключён' },
      { status: 403 },
    );
  }
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'passkey_verify');
  if (rateLimit.limited) {
    return NextResponse.json(
      { ok: false, error: rateLimit.reason },
      { status: rateLimit.reason === 'proxy_configuration' ? 503 : 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    userId = await finishPatientPasskeyAuthentication({
      challengeId: parsed.data.challengeId,
      response: parsed.data.response as AuthenticationResponseJSON,
    });
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials', message: 'Не удалось подтвердить ключ доступа' },
      { status: 401 },
    );
  }

  if (isPlatformUserUuid(userId)) {
    enterStaffSecuritySelfPrincipal(userId, 'api/auth/passkey/login:passkey-verified-self');
  }
  const user = await findPasskeyUserById(userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  }

  const prepared = await prepareVerifiedPrimaryLogin({
    user,
    staffSecurity: buildAppDeps().staffSecurity,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await setSessionFromUser(user, prepared.sessionOptions);
  await recordAuthLogin({
    userId,
    entryChannel: 'browser',
    authMethod: 'passkey',
  });
  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(user.role),
    role: user.role,
  });
}
