import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  consumeEmailChallengeCode,
  consumeLatestEmailChallengeCodeForUser,
  normalizeEmail,
} from "@/modules/auth/emailAuth";
import { hashPin } from "@/modules/auth/pinHash";

const bodySchema = z.object({
  email: z.string().email(),
  /** Опционально: после forgot-password без `challengeId` в ответе используется {@link consumeLatestEmailChallengeCodeForUser}. */
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  newPassword: z.string().min(8).max(128),
});

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
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const consumed = parsed.data.challengeId
    ? await consumeEmailChallengeCode(userId, parsed.data.challengeId, parsed.data.code)
    : await consumeLatestEmailChallengeCodeForUser(userId, parsed.data.code);
  if (!consumed.ok) {
    const status =
      consumed.code === "too_many_attempts" ? 429 : consumed.code === "expired_code" ? 410 : 400;
    return NextResponse.json(
      { ok: false, error: consumed.code, retryAfterSeconds: consumed.retryAfterSeconds },
      { status },
    );
  }

  const passwordHash = await hashPin(parsed.data.newPassword);
  try {
    await deps.userPasswordCredentials.updatePasswordHash(userId, passwordHash);
  } catch {
    return NextResponse.json({ ok: false, error: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
