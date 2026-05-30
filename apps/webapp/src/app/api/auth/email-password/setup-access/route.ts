import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  email: z.string().email(),
});

/** Повторная отправка setup-кода для contact-only / verified без пароля (явный запрос UI). */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);

  if (state.kind !== "needs_email_setup") {
    return NextResponse.json({ ok: false, error: "not_eligible" }, { status: 400 });
  }

  const challenge = await startEmailChallenge(state.userId, emailNorm);
  if (!challenge.ok) {
    return NextResponse.json(
      { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
      { status: challenge.code === "rate_limited" ? 429 : 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: challenge.challengeId,
    retryAfterSeconds: challenge.retryAfterSeconds,
  });
}
