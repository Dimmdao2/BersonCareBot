import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
  attemptId: z.string().uuid().optional(),
});

const LOG_BASE = {
  authMethod: "email_password" as const,
  entryChannel: "browser" as const,
  contactType: "email" as const,
  stage: "confirm" as const,
};

/** Публичное подтверждение email после `POST .../email-password/register` (без сессии до успеха). */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId: randomUUID(),
      contactValue: null,
      errorCode: "invalid_body",
    });
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const attemptId = parsed.data.attemptId?.trim() || parsed.data.challengeId;

  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(parsed.data.challengeId);
  if (!userId) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: null,
      challengeId: parsed.data.challengeId,
      errorCode: "expired_code",
    });
    return NextResponse.json({ ok: false, error: "expired_code", message: "Код недействителен" }, { status: 400 });
  }

  const profileEmail = (await deps.userProjection.getProfileEmailFields(userId)).email ?? null;

  const result = await confirmEmailChallenge(userId, parsed.data.challengeId, parsed.data.code);
  if (!result.ok) {
    const status = result.code === "too_many_attempts" ? 429 : 400;
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: profileEmail,
      userId,
      challengeId: parsed.data.challengeId,
      errorCode: result.code,
    });
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
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: profileEmail,
      userId,
      challengeId: parsed.data.challengeId,
      errorCode: "server_error",
    });
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

  await recordAuthRegistrationSuccess({
    ...LOG_BASE,
    attemptId,
    contactValue: profileEmail,
    userId: sessionUser.userId,
    challengeId: parsed.data.challengeId,
    isNewAccount: true,
  });

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
