import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ChannelContext } from "@/modules/auth/channelContext";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import type { PhoneOtpDelivery } from "@/modules/auth/smsPort";
import { isValidRuMobileNormalized } from "@/modules/auth/phoneValidation";

const bodySchema = z.object({
  phone: z.string().min(1),
  displayName: z.string().optional(),
  channel: z.enum(["web", "telegram"]).optional(),
  chatId: z.string().optional(),
  deliveryChannel: z.enum(["sms", "telegram", "max", "email"]).optional(),
});

/**
 * Start phone auth. Для telegram channel/chatId берутся из тела (как на bind-phone);
 * для web при отсутствии chatId подставляется серверный UUID.
 * deliveryChannel: sms (по умолчанию) | telegram | max | email — куда отправить OTP.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "phone_required", message: "Номер телефона обязателен" },
      { status: 400 }
    );
  }

  const { phone, displayName } = parsed.data;
  const channel = parsed.data.channel ?? "web";
  const deliveryChannel = parsed.data.deliveryChannel ?? "sms";

  let context: ChannelContext;

  if (channel === "telegram") {
    const chatId = parsed.data.chatId?.trim();
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: "chat_id_required", message: "Для Telegram укажите chatId" },
        { status: 400 }
      );
    }
    context = {
      channel: "telegram",
      chatId,
      displayName: displayName?.trim() || undefined,
    };
  } else {
    const cid = parsed.data.chatId?.trim();
    context = {
      channel: "web",
      chatId: cid && cid.length > 0 ? cid : randomUUID(),
      displayName: displayName?.trim() || undefined,
    };
  }

  const normalized = normalizePhone(phone);
  if (!isValidRuMobileNormalized(normalized)) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone", message: "Неверный формат номера" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(normalized);

  let delivery: PhoneOtpDelivery | undefined;
  if (deliveryChannel === "sms") {
    delivery = { channel: "sms" };
  } else if (deliveryChannel === "telegram") {
    const recipientId = user?.bindings?.telegramId;
    if (!recipientId) {
      return NextResponse.json(
        { ok: false, error: "channel_unavailable", message: "Telegram не привязан к этому номеру" },
        { status: 400 }
      );
    }
    delivery = { channel: "telegram", recipientId };
  } else if (deliveryChannel === "max") {
    const recipientId = user?.bindings?.maxId;
    if (!recipientId) {
      return NextResponse.json(
        { ok: false, error: "channel_unavailable", message: "Max не привязан к этому номеру" },
        { status: 400 }
      );
    }
    delivery = { channel: "max", recipientId };
  } else {
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "channel_unavailable", message: "Сначала подтвердите email в профиле" },
        { status: 400 }
      );
    }
    const email = await deps.userByPhone.getVerifiedEmailForUser(user.userId);
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "channel_unavailable", message: "Подтверждённый email не найден" },
        { status: 400 }
      );
    }
    delivery = { channel: "email", email };
  }

  const result = await deps.auth.startPhoneAuth(phone, context, { delivery });

  if (!result.ok) {
    const status = result.code === "rate_limited" || result.code === "too_many_attempts" ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(result.code),
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
    deliveryChannel,
  });
}

function errorMessage(code: string): string {
  switch (code) {
    case "invalid_phone":
      return "Неверный формат номера";
    case "rate_limited":
      return "Слишком много запросов. Попробуйте позже.";
    case "too_many_attempts":
      return "Превышено количество попыток.";
    default:
      return "Ошибка отправки кода.";
  }
}
