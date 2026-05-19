import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(128),
});

/** Подтверждение email, установка пароля, consume token, сессия. */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.emailSetupFlow.completeEmailSetup(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    const status =
      result.error === "invalid_password"
        ? 400
        : result.error === "expired"
          ? 410
          : result.error === "already_has_login"
            ? 409
            : result.error === "email_mismatch"
              ? 409
              : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  let sessionUser = await deps.userByPhone.findByUserId(result.userId);
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
