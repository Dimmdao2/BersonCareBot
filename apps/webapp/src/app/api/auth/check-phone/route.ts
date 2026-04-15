import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { OtpUiChannel } from "@/modules/auth/otpChannelUi";
import { resolveAuthMethodsForPhone } from "@/modules/auth/checkPhoneMethods";
import { isCheckPhoneRateLimited } from "@/modules/auth/checkPhoneRateLimit";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите номер телефона" },
      { status: 400 }
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhoneE164(phone)) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone", message: "Неверный формат номера" },
      { status: 400 }
    );
  }

  if (await isCheckPhoneRateLimited(phone)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много запросов. Попробуйте позже." },
      { status: 429 }
    );
  }

  const deps = buildAppDeps();
  const botUsername = (await getTelegramLoginBotUsername()).trim();
  const telegramLoginAvailable = botUsername.length > 0;
  const result = await resolveAuthMethodsForPhone(
    phone,
    {
      userByPhonePort: deps.userByPhone,
      userPinsPort: deps.userPins,
      oauthBindingsPort: deps.oauthBindings,
    },
    { telegramLoginAvailable, suppressSmsForPublicWebLogin: true },
  );

  let preferredOtpChannel: OtpUiChannel | null = null;
  if (result.exists) {
    preferredOtpChannel = await deps.channelPreferences.getPreferredAuthOtpChannel(result.userId);
  }

  return NextResponse.json({
    ok: true,
    exists: result.exists,
    methods: result.methods,
    ...(result.exists ? { preferredOtpChannel } : {}),
  });
}
