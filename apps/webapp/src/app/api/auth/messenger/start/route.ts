import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { createLoginTokenPlain, hashLoginTokenPlain } from "@/modules/auth/messengerLoginToken";
import { isMessengerStartRateLimited } from "@/modules/auth/messengerStartRateLimit";
import { normalizePhone } from "@/modules/auth/phoneNormalize";

const bodySchema = z.object({
  phone: z.string().min(1),
  method: z.enum(["telegram", "max"]),
});

const LOGIN_TTL_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите телефон и канал" },
      { status: 400 }
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 10) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone", message: "Неверный формат номера" },
      { status: 400 }
    );
  }

  if (isMessengerStartRateLimited(phone)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много запросов. Попробуйте позже." },
      { status: 429 }
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(phone);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "user_not_found", message: "Пользователь не найден" },
      { status: 404 }
    );
  }

  const plain = createLoginTokenPlain();
  const tokenHash = hashLoginTokenPlain(plain);
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
  await deps.loginTokens.createPending({
    tokenHash,
    userId: user.userId,
    method: parsed.data.method,
    expiresAt,
  });

  const bot = env.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
  const deepLink =
    parsed.data.method === "telegram"
      ? `https://t.me/${bot}?start=${encodeURIComponent(plain)}`
      : null;

  return NextResponse.json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    deepLink,
  });
}
