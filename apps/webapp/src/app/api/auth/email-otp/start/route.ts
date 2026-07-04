import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { startPublicEmailOtpChallenge } from "@/modules/auth/emailOtpPublic";
import { formatOtpRetryAfterMessage } from "@/modules/auth/otpConstants";

const bodySchema = z.object({
  email: z.string().min(1),
});

/**
 * POST /api/auth/email-otp/start
 *
 * Public (unauthenticated) endpoint: request a 6-digit OTP code to the given email.
 * Anti-enumeration: same response body shape for known and unknown emails.
 * Distinguishing errors: rate_limited (timing), invalid_email (format), email_send_failed (infra).
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_email", message: "Неверный формат email" },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const result = await startPublicEmailOtpChallenge(parsed.data.email, deps.emailOtpPublicDb);

  if (!result.ok) {
    switch (result.code) {
      case "invalid_email":
        return NextResponse.json(
          { ok: false, error: "invalid_email", message: "Неверный формат email" },
          { status: 400 },
        );

      case "rate_limited":
        return NextResponse.json(
          {
            ok: false,
            error: "rate_limited",
            retryAfterSeconds: result.retryAfterSeconds,
            message: formatOtpRetryAfterMessage(result.retryAfterSeconds ?? 60),
          },
          {
            status: 429,
            headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) },
          },
        );

      case "email_send_failed":
        return NextResponse.json(
          { ok: false, error: "email_send_failed", message: "Не удалось отправить код. Попробуйте позже." },
          { status: 503 },
        );

      default:
        return NextResponse.json(
          { ok: false, error: "error", message: "Не удалось отправить код. Попробуйте позже." },
          { status: 500 },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds ?? 60,
  });
}
