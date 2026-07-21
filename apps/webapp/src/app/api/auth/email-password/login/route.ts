import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { prepareVerifiedPrimaryLoginWithStatus } from "@/modules/auth/verifiedStaffPrimaryLogin";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/email-password/login:POST", request);
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

  enterStaffSecuritySelfPrincipal(pwd.userId, "api/auth/email-password/login:primary-verified");
  let sessionUser = await deps.userByPhone.findByUserId(pwd.userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const envRole = resolveRoleFromEnv({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });
  const effectiveRole = reconcileDbRoleWithEnvRole(sessionUser.role, envRole);
  if (sessionUser.role !== effectiveRole) {
    await deps.userProjection.updateRole(sessionUser.userId, effectiveRole);
    sessionUser = { ...sessionUser, role: effectiveRole };
  }

  let security = await deps.staffSecurity.getStatus();
  let recoveringSpecialistSignup = false;
  if (!security) {
    const signupIntent = await deps.organizationProvisioning.getLatestSpecialistSignupIntentForUser();
    if (signupIntent) {
      recoveringSpecialistSignup = true;
      try {
        security = await deps.staffSecurity.ensureProfile();
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "security_setup_pending",
            message: "Не удалось подготовить защищённый вход. Повторите попытку позже.",
          },
          { status: 503 },
        );
      }
    }
  }
  const authenticatedUser = recoveringSpecialistSignup ? { ...sessionUser, role: "doctor" as const } : sessionUser;
  const prepared = await prepareVerifiedPrimaryLoginWithStatus({
    user: authenticatedUser,
    security,
    staffSecurity: deps.staffSecurity,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await setSessionFromUser(authenticatedUser, prepared.sessionOptions);
  return NextResponse.json({
    ok: true,
    redirectTo: security && !security.enrolled ? "/app/account?tab=security" : getRedirectPathForRole(sessionUser.role),
  });
}
