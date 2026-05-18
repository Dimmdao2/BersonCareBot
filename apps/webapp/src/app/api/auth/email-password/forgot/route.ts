import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * Запрос сброса пароля: код на почту (тот же контур `email_challenges`, что и верификация регистрации).
 * Ответ одинаков при отсутствии учётки — без перечисления существования email.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findVerifiedUserIdWithPassword(emailNorm);
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  const challenge = await startEmailChallenge(userId, emailNorm);
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
