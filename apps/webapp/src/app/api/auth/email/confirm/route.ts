import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { getCurrentSession } from "@/modules/auth/service";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/email/confirm:POST");
  if (!(await isAuthChannelEnabled("email"))) {
    return NextResponse.json(
      { ok: false, error: AUTH_CHANNEL_DISABLED_ERROR },
      { status: 503 },
    );
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "Требуется вход" }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error", message: "Некорректные данные" }, { status: 400 });
  }

  const organizationId = getCurrentDbPrincipalOrganizationId();
  const result = await confirmEmailChallenge(
    session.user.userId,
    parsed.data.challengeId,
    parsed.data.code,
    organizationId ? { profileBindOrganizationId: organizationId } : undefined,
  );
  if (!result.ok) {
    const status =
      result.code === "too_many_attempts" ? 429 : result.code === "email_conflict" ? 409 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errMsg(result.code),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      }
    );
  }

  return NextResponse.json({ ok: true });
}

function errMsg(code: string): string {
  switch (code) {
    case "invalid_code":
      return "Неверный код";
    case "expired_code":
      return "Код истёк. Запросите новый.";
    case "too_many_attempts":
      return "Превышено число попыток.";
    case "email_conflict":
      return "Этот email уже используется другим аккаунтом";
    default:
      return "Ошибка подтверждения";
  }
}
