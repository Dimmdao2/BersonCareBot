import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

// SECURITY: PIN removed as a login/re-auth method (owner, 2026-08-04, docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md §7).
// Destructive purge is protected by single-factor OTP only (SMS challenge).
/**
 * Отправка OTP на привязанный номер для удаления дневниковых данных.
 */
export async function POST() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.diary });
  if (!gate.ok) return gate.response;
  const session = gate.session;
  const phone = session.user.phone!.trim();
  const deps = buildAppDeps();
  const result = await deps.auth.startPhoneAuth(
    phone,
    { channel: 'web', chatId: randomUUID() },
    { delivery: { channel: 'sms' } },
  );

  if (!result.ok) {
    const status =
      result.code === 'rate_limited' || result.code === 'too_many_attempts'
        ? 429
        : result.code === 'delivery_failed'
          ? 503
          : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
