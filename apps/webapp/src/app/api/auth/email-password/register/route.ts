import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";
import { hashPin } from "@/modules/auth/pinHash";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(200).optional(),
});

/** Регистрация email+password: строка канона + пароль; подтверждение почты через существующий email challenge. */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const displayName = (parsed.data.displayName?.trim() || emailNorm.split("@")[0] || "Пациент").slice(0, 500);

  const deps = buildAppDeps();
  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingVerification({
    emailNormalized: emailNorm,
    passwordHash,
    displayName,
  });

  async function respondWithChallenge(userId: string, rollbackOnSendFail: boolean) {
    const challenge = await startEmailChallenge(userId, emailNorm);
    if (!challenge.ok) {
      if (rollbackOnSendFail) {
        await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(userId);
      }
      return NextResponse.json(
        { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
        { status: challenge.code === "rate_limited" ? 429 : 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      challengeId: challenge.challengeId,
      retryAfterSeconds: challenge.retryAfterSeconds,
    });
  }

  if (reg.ok) {
    return respondWithChallenge(reg.userId, true);
  }

  if (reg.reason === "duplicate_email") {
    const resent = await deps.userPasswordCredentials.tryResendRegistrationChallenge({
      emailNormalized: emailNorm,
      plainPassword: parsed.data.password,
    });
    if (!resent.ok) {
      return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
    }
    return respondWithChallenge(resent.userId, false);
  }

  return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
}
