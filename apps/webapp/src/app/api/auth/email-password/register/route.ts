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
  if (!reg.ok) {
    return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
  }

  const challenge = await startEmailChallenge(reg.userId, emailNorm);
  if (!challenge.ok) {
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
