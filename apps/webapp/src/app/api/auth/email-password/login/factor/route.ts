import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  clearStaffLoginContinuation,
  readStaffLoginContinuation,
} from "@/modules/auth/staffLoginContinuation";
import { setSessionFromUser } from "@/modules/auth/service";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";

const bodySchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u).optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode));

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/email-password/login/factor:POST");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const continuation = await readStaffLoginContinuation();
  if (!continuation) {
    return NextResponse.json({ ok: false, error: "login_challenge_expired" }, { status: 401 });
  }
  const deps = buildAppDeps();
  const result = await deps.staffSecurity.completeLogin({
    userId: continuation.userId,
    token: continuation.token,
    code: parsed.data.code,
    recoveryCode: parsed.data.recoveryCode,
  });
  if (!result.ok) {
    if (result.error === "login_challenge_expired") await clearStaffLoginContinuation();
    return NextResponse.json(
      { ok: false, error: result.error, lockedUntil: "lockedUntil" in result ? result.lockedUntil : undefined },
      { status: result.error === "factor_locked" ? 429 : 401 },
    );
  }
  const user = await deps.userByPhone.findByUserId(continuation.userId);
  if (!user) return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  await setSessionFromUser(user, {
    staffSecurity: {
      assurance: result.recoveryMode ? "recovery" : "factor_verified",
      verifiedAt: Math.floor(Date.now() / 1000),
    },
  });
  await clearStaffLoginContinuation();
  return NextResponse.json({
    ok: true,
    redirectTo: result.recoveryMode ? "/app/account?tab=security" : getRedirectPathForRole(user.role),
    recoveryMode: result.recoveryMode,
  });
}
