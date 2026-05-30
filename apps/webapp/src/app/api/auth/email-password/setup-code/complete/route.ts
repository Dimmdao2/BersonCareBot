import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  confirmEmailChallenge,
  consumeLatestEmailChallengeCodeForUser,
  normalizeEmail,
} from "@/modules/auth/emailAuth";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";
import { hashPin } from "@/modules/auth/pinHash";

const bodySchema = z.object({
  email: z.string().email(),
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  password: z.string().min(8).max(128),
});

/** Contact-only email setup by code: verify email, set password, create session. */
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
    const status = state.kind === "verified_with_password" ? 409 : 400;
    return NextResponse.json({ ok: false, error: state.kind === "verified_with_password" ? "already_has_login" : "not_eligible" }, { status });
  }

  const confirmed = parsed.data.challengeId
    ? await confirmEmailChallenge(state.userId, parsed.data.challengeId, parsed.data.code)
    : await consumeLatestEmailChallengeCodeForUser(state.userId, parsed.data.code);
  if (!confirmed.ok) {
    const status = confirmed.code === "too_many_attempts" ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: confirmed.code,
        retryAfterSeconds: confirmed.retryAfterSeconds,
      },
      {
        status,
        ...(confirmed.retryAfterSeconds != null && {
          headers: { "Retry-After": String(confirmed.retryAfterSeconds) },
        }),
      },
    );
  }

  const passwordHash = await hashPin(parsed.data.password);
  await deps.userPasswordCredentials.upsertPasswordHash(state.userId, passwordHash);

  let sessionUser = await deps.userByPhone.findByUserId(state.userId);
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
    role: sessionUser.role,
  });
}
