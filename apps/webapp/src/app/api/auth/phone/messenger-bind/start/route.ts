import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isPhoneMessengerBindStartRateLimited } from "@/modules/auth/phoneMessengerBindStartRateLimit";
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
      { ok: false, error: "rate_limited", message: "Слишком много запросов. Попробуйте позже." },
      { status: 429 },
    );
  }

  const [botUsername, maxBotNickname] = await Promise.all([
    getTelegramLoginBotUsername(),
    getMaxLoginBotNickname(),
  ]);

  const result = await buildAppDeps().phoneMessengerBind.start({
    phone,
    channelCode: parsed.data.channelCode,
    purpose: parsed.data.purpose,
    botUsername,
    maxBotNickname,
    sessionUserId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code, message: "Не удалось начать привязку" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    setupToken: result.setupToken,
    url: result.url,
    expiresAt: result.expiresAtIso,
    ...(result.manualCommand ? { manualCommand: result.manualCommand } : {}),
  });
}
