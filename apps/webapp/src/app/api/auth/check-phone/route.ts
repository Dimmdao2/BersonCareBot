import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPublicCheckPhoneMethods } from '@/modules/auth/checkPhoneMethods';
import { isCheckPhoneRateLimited } from '@/modules/auth/checkPhoneRateLimit';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import { getClientVisibleAuthChannelPolicy } from '@/modules/auth/authChannelPolicy';
import { notificationText } from '@/shared/notifications/notificationText';

const PUBLIC_CHECK_PHONE_MIN_RESPONSE_MS = 500;

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  stampBootstrapPrincipal('api/auth/check-phone:POST', request);

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', message: notificationText.authPhoneRequired },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhoneE164(phone)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_phone', message: notificationText.authPhoneInvalidFormat },
      { status: 400 },
    );
  }

  if (await isCheckPhoneRateLimited(phone)) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', message: notificationText.authTooManyAttempts },
      { status: 429 },
    );
  }

  // Owner ruling 2026-07-24: a channel toggled on but unconfigured must not appear to the client.
  const channelPolicy = await getClientVisibleAuthChannelPolicy();
  const remainingMs = PUBLIC_CHECK_PHONE_MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }

  return NextResponse.json({
    ok: true,
    methods: getPublicCheckPhoneMethods(channelPolicy),
  });
}
