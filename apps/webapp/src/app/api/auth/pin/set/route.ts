import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { hashPin } from '@/modules/auth/pinHash';
import { isPinSetRateLimited } from '@/modules/auth/pinSetRateLimit';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  pinConfirm: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/pin/set:POST', request);
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;
  const { session } = gate;
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
      { ok: false, error: 'invalid_body', message: 'Укажите PIN и подтверждение' },
      { status: 400 },
    );
  }

  const { pin, pinConfirm } = parsed.data;
  if (pin !== pinConfirm) {
    return NextResponse.json(
      { ok: false, error: 'pin_mismatch', message: 'PIN не совпадает' },
      { status: 400 },
    );
  }
  const deps = buildAppDeps();
  if (isPinSetRateLimited(session.user.userId)) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', message: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429 },
    );
  }

  const pinHash = await hashPin(pin);
  await deps.userPins.upsertPinHashForCurrentPrincipal(session.user.userId, pinHash);

  return NextResponse.json({ ok: true });
}
