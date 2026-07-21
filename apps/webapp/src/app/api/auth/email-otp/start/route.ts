import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isEmailOtpStartRateLimitedByKey } from "@/modules/auth/authRateLimits";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { startPublicEmailOtpChallenge } from "@/modules/auth/emailOtpPublic";
import { formatOtpRetryAfterMessage } from "@/modules/auth/otpConstants";
import { resolveRealIpRateLimitClientKey } from "@/modules/auth/realIpRateLimitClientKey";

const bodySchema = z.object({
  email: z.string().min(1),
});

/** Общий bucket только в non-production, если прокси не передал X-Real-Ip. */
const EMAIL_OTP_START_FALLBACK_CLIENT_KEY = "email_otp_start:missing_x_real_ip";

/**
 * POST /api/auth/email-otp/start
 *
 * Public (unauthenticated) endpoint: request a 6-digit OTP code to the given email.
 * Anti-enumeration: same response body shape for known and unknown emails.
 * Distinguishing errors: rate_limited (timing), invalid_email (format), email_send_failed (infra).
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/email-otp/start:POST");
  if (!(await isAuthChannelEnabled("email"))) {
    return NextResponse.json(
      { ok: false, error: AUTH_CHANNEL_DISABLED_ERROR },
      { status: 503 },
    );
  }
  ensureAuthModulePortsBound();

  // Per-IP limit (trusted X-Real-Ip only) — generic response, no enumeration signal.
  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: "auth.email_otp_start",
    logPrefix: "email_otp_start",
    fallbackKey: EMAIL_OTP_START_FALLBACK_CLIENT_KEY,
  });
  if (!identity.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "proxy_configuration",
        message: "Запрос должен проходить через reverse proxy с заголовком X-Real-IP.",
      },
      { status: 503 },
    );
  }
  if (await isEmailOtpStartRateLimitedByKey(identity.key)) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: 60,
        message: formatOtpRetryAfterMessage(60),
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

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
