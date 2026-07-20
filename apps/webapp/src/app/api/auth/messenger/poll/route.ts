import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { hashLoginTokenPlain } from "@/modules/auth/messengerLoginToken";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

const bodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/messenger/poll:POST");
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите token" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const now = new Date();
  await deps.loginTokens.markExpiredIfPast(now);

  const tokenHash = hashLoginTokenPlain(parsed.data.token.trim());
  const row = await deps.loginTokens.findByTokenHash(tokenHash);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Токен не найден" },
      { status: 404 }
    );
  }

  if (row.expiresAt.getTime() < now.getTime() && row.status === "pending") {
    return NextResponse.json({
      ok: true,
      status: "expired" as const,
    });
  }

  if (row.status === "pending") {
    return NextResponse.json({
      ok: true,
      status: "pending" as const,
    });
  }

  if (row.status === "expired") {
    return NextResponse.json({
      ok: true,
      status: "expired" as const,
    });
  }

  if (row.status === "confirmed") {
    if (isPlatformUserUuid(row.userId)) {
      enterStaffSecuritySelfPrincipal(row.userId, "api/auth/messenger/poll:confirmed-token-self");
    }
    const user = await deps.userByPhone.findByUserId(row.userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "user_missing", message: "Пользователь не найден" },
        { status: 500 }
      );
    }
    const envRole = resolveRoleFromEnv({
      phone: user.phone,
      telegramId: user.bindings?.telegramId,
      maxId: user.bindings?.maxId,
    });
    const effectiveRole = user.role !== envRole ? envRole : user.role;
    const redirectTo = getRedirectPathForRole(effectiveRole);

    if (row.sessionIssuedAt) {
      return NextResponse.json({
        ok: true,
        status: "confirmed" as const,
        redirectTo,
        resumed: true as const,
      });
    }

    let sessionUser = user;
    if (user.role !== envRole) {
      await deps.userProjection.updateRole(user.userId, envRole);
      sessionUser = { ...user, role: envRole };
    }

    await setSessionFromUser(sessionUser);
    await deps.loginTokens.markSessionIssued(tokenHash, now);

    return NextResponse.json({
      ok: true,
      status: "confirmed" as const,
      redirectTo: getRedirectPathForRole(sessionUser.role),
    });
  }

  return NextResponse.json(
    { ok: false, error: "invalid_state", message: "Некорректный токен" },
    { status: 400 }
  );
}
