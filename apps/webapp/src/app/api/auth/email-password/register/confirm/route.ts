import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
});

/** Публичное подтверждение email после `POST .../email-password/register` (без сессии до успеха). */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(parsed.data.challengeId);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "expired_code", message: "Код недействителен" }, { status: 400 });
  }

  const result = await confirmEmailChallenge(userId, parsed.data.challengeId, parsed.data.code);
  if (!result.ok) {
    const status = result.code === "too_many_attempts" ? 429 : 400;
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
      },
    );
  }

  let sessionUser = await deps.userByPhone.findByUserId(userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  const envRole = resolveRoleFromEnv({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });
  if (sessionUser.role !== envRole) {
    await deps.userProjection.updateRole(sessionUser.userId, envRole);
    sessionUser = { ...sessionUser, role: envRole };
  }

  await setSessionFromUser(sessionUser);
  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
  });
}

function errMsg(code: string): string {
  switch (code) {
    case "invalid_code":
      return "Неверный код";
    case "expired_code":
      return "Код истёк. Запросите новый.";
    case "too_many_attempts":
      return "Превышено число попыток.";
    default:
      return "Ошибка подтверждения";
  }
}
