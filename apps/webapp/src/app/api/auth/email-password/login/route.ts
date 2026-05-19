import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();

  const pwd = await deps.userPasswordCredentials.verifyEmailPasswordForLogin(emailNorm, parsed.data.password);
  if (!pwd) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }
  if (!pwd.emailVerified) {
    return NextResponse.json({ ok: false, error: "email_not_verified" }, { status: 409 });
  }

  let sessionUser = await deps.userByPhone.findByUserId(pwd.userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
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
