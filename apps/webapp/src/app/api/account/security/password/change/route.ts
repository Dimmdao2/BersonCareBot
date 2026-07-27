import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffSecurityApiSession } from "@/app-layer/guards/requireRole";
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from "@/modules/auth/authConfirmRateLimit";
import { newPasswordSchema } from "@/modules/auth/passwordPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});

export async function POST(request: Request) {
  const rateLimit = await checkAuthConfirmRateLimit(request, "account_password_change");
  if (rateLimit.limited) {
    if (rateLimit.reason === "proxy_configuration") {
      return NextResponse.json(
        { ok: false, error: "proxy_configuration" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
      },
      {
        status: 429,
        headers: { "Retry-After": String(AUTH_CONFIRM_RATE_LIMIT_SEC) },
      },
    );
  }

  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const weakNewPassword = parsed.error.issues.some(
      (issue) => issue.path[0] === "newPassword",
    );
    return NextResponse.json(
      {
        ok: false,
        error: weakNewPassword ? "weak_new_password" : "invalid_body",
      },
      { status: 400 },
    );
  }

  try {
    const result = await buildAppDeps().passwordChange.changePassword({
      userId: gate.session.user.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === "wrong_current_password" ? 401 : 409 },
      );
    }

    await setSessionFromUser(
      result.user,
      gate.session.staffSecurity
        ? { staffSecurity: gate.session.staffSecurity }
        : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "password_change_failed" },
      { status: 500 },
    );
  }
}
