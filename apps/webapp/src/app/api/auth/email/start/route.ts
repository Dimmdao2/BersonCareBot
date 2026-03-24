import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { startEmailChallenge } from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  email: z
    .string()
    .trim()
    .max(320)
    .email({ message: "Некорректный email" }),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "Требуется вход" }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error", message: "Некорректный email" }, { status: 400 });
  }

  const result = await startEmailChallenge(session.user.userId, parsed.data.email);
  if (!result.ok) {
    const status = result.code === "rate_limited" || result.code === "too_many_attempts" ? 429 : 400;
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

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

function errMsg(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Некорректный адрес email";
    case "rate_limited":
      return "Слишком частые запросы. Подождите перед повторной отправкой.";
    case "too_many_attempts":
      return "Превышено число попыток.";
    default:
      return "Не удалось отправить код";
  }
}
