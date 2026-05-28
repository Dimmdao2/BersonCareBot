import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import { formatOtpRetryAfterMessage } from "@/modules/auth/otpConstants";
import {
  isPhoneMessengerBindStartRateLimited,
  PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC,
} from "@/modules/auth/phoneMessengerBindStartRateLimit";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import { getMaxLoginBotNickname } from "@/modules/system-settings/maxLoginBotNickname";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";
import { canAccessPatient } from "@/modules/roles/service";

const bodySchema = z.object({
  phone: z.string().min(1),
  channelCode: z.enum(["telegram", "max"]),
  purpose: z.enum(["login", "profile_bind"]),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите телефон, канал и назначение" },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhoneE164(phone)) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone", message: "Неверный формат номера" },
      { status: 400 },
    );
  }

  let sessionUserId: string | null = null;
  if (parsed.data.purpose === "profile_bind") {
    const session = await getCurrentSession();
    if (!session || !canAccessPatient(session.user.role)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    sessionUserId = session.user.userId;
  }

  const rateKey =
    parsed.data.purpose === "profile_bind" && sessionUserId
      ? `${phone}:${sessionUserId}`
      : phone;
  if (await isPhoneMessengerBindStartRateLimited(rateKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC,
        message: formatOtpRetryAfterMessage(PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC),
      },
      {
        status: 429,
        headers: { "Retry-After": String(PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC) },
      },
    );
  }

  const deps = buildAppDeps();
  const isRegistrationIntent =
    parsed.data.purpose === "login" && !(await deps.userByPhone.findByPhone(phone));

  const [botUsername, maxBotNickname] = await Promise.all([
    getTelegramLoginBotUsername(),
    getMaxLoginBotNickname(),
  ]);

  const result = await deps.phoneMessengerBind.start({
    phone,
    channelCode: parsed.data.channelCode,
    purpose: parsed.data.purpose,
    botUsername,
    maxBotNickname,
    sessionUserId,
  });

  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId: newRegistrationAttemptId(),
        authMethod: "messenger_bind",
        stage: "start",
        entryChannel: "browser",
        contactType: "phone",
        contactValue: phone,
        errorCode: result.code,
      });
    }
    return NextResponse.json(
      { ok: false, error: result.code, message: "Не удалось начать привязку" },
      { status: 400 },
    );
  }

  if (isRegistrationIntent) {
    await recordAuthRegistrationAttempt({
      attemptId: result.setupToken,
      authMethod: "messenger_bind",
      stage: "start",
      entryChannel: "browser",
      contactType: "phone",
      contactValue: phone,
    });
    await recordAuthRegistrationSuccess({
      attemptId: result.setupToken,
      authMethod: "messenger_bind",
      stage: "challenge_sent",
      entryChannel: "browser",
      contactType: "phone",
      contactValue: phone,
      isNewAccount: true,
    });
  }

  return NextResponse.json({
    ok: true,
    setupToken: result.setupToken,
    url: result.url,
    expiresAt: result.expiresAtIso,
    ...(result.manualCommand ? { manualCommand: result.manualCommand } : {}),
  });
}
