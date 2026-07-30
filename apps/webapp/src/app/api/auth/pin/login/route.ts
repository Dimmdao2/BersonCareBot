import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { verifyPinForLogin } from '@/modules/auth/pinAuth';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { prepareVerifiedPrimaryLogin } from '@/modules/auth/verifiedStaffPrimaryLogin';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

const GENERIC_PIN_FAIL = 'Неверный номер или PIN';

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
  pin: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/pin/login:POST', request);
  if (!(await isIndependentAuthMethodEnabled('pin'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: 'Вход по PIN отключён' },
      { status: 403 },
    );
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', message: 'Номер и PIN обязательны (ровно 4 цифры)' },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhoneE164(phone)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_phone', message: 'Неверный формат номера' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(phone);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials', message: GENERIC_PIN_FAIL },
      { status: 401 },
    );
  }

  const v = await verifyPinForLogin(user.userId, parsed.data.pin, deps.userPins);
  if (!v.ok) {
    if (v.code === 'no_pin') {
      return NextResponse.json(
        { ok: false, error: 'invalid_credentials', message: GENERIC_PIN_FAIL },
        { status: 401 },
      );
    }
    if (v.code === 'locked') {
      return NextResponse.json(
        {
          ok: false,
          error: 'lockout',
          message: 'Слишком много попыток. Попробуйте позже.',
          lockedUntil: v.lockedUntilIso,
        },
        { status: 423 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_credentials',
        message: GENERIC_PIN_FAIL,
        attemptsLeft: v.attemptsLeft,
      },
      { status: 401 },
    );
  }

  if (isPlatformUserUuid(user.userId)) {
    enterStaffSecuritySelfPrincipal(user.userId, 'api/auth/pin/login:pin-verified-self');
  }
  const exactUser = await deps.userByPhone.findByUserId(user.userId);
  if (!exactUser) {
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials', message: GENERIC_PIN_FAIL },
      { status: 401 },
    );
  }

  let sessionUser = exactUser;
  const envRole = resolveRoleFromEnv({
    phone: exactUser.phone,
    telegramId: exactUser.bindings?.telegramId,
    maxId: exactUser.bindings?.maxId,
  });
  const effectiveRole = reconcileDbRoleWithEnvRole(exactUser.role, envRole);
  if (exactUser.role !== effectiveRole) {
    await deps.userProjection.updateRole(exactUser.userId, effectiveRole);
    sessionUser = { ...exactUser, role: effectiveRole };
  }

  const prepared = await prepareVerifiedPrimaryLogin({
    user: sessionUser,
    staffSecurity: deps.staffSecurity,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await setSessionFromUser(sessionUser, prepared.sessionOptions);
  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
  });
}
