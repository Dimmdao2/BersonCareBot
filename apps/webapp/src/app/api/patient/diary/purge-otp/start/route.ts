import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession, isDiaryPurgePinReauthValid } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

/**
 * Отправка OTP на привязанный номер для удаления дневниковых данных.
 * Требует предварительного POST /api/auth/pin/verify.
 */
export async function POST() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const phone = session.user.phone?.trim();
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "no_phone", message: "Привяжите номер телефона в профиле" },
      { status: 400 }
    );
  }
  if (!isDiaryPurgePinReauthValid(session)) {
    return NextResponse.json(
      { ok: false, error: "pin_reauth_required", message: "Сначала подтвердите PIN" },
      { status: 403 }
    );
  }

  const deps = buildAppDeps();
  const result = await deps.auth.startPhoneAuth(phone, { channel: "web", chatId: randomUUID() }, { delivery: { channel: "sms" } });

  if (!result.ok) {
    const status =
      result.code === "rate_limited" || result.code === "too_many_attempts"
        ? 429
        : result.code === "delivery_failed"
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
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      }
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
