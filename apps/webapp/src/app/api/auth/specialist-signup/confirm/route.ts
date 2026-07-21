import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { getSpecialistSignupEnabled } from "@/modules/auth/specialistSignupRollout";
import { getCurrentSession, setSessionFromUser } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/specialist-signup/confirm:POST");
  if (!(await isAuthChannelEnabled("email"))) {
    return NextResponse.json(
      { ok: false, error: AUTH_CHANNEL_DISABLED_ERROR },
      { status: 503 },
    );
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const specialistSignupEnabled = await getSpecialistSignupEnabled();
  if (!specialistSignupEnabled) {
    return NextResponse.json({ ok: false, error: "specialist_signup_disabled" }, { status: 423 });
  }

  const deps = buildAppDeps();
  let userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(parsed.data.challengeId);
  let establishedSession = false;
  if (!userId) {
    const intent = await deps.organizationProvisioning.getSpecialistSignupIntentByChallengeId(parsed.data.challengeId);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    const session = await getCurrentSession();
    if (
      !session ||
      session.user.userId !== intent.userId ||
      session.user.role !== "doctor" ||
      session.staffSecurity?.assurance !== "pending_enrollment"
    ) {
      return NextResponse.json({ ok: false, error: "verification_required" }, { status: 401 });
    }
    userId = intent.userId;
    establishedSession = true;
  }

  if (!establishedSession) {
    const verifiedUserId = userId;
    if (!verifiedUserId) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    const result = await confirmEmailChallenge(verifiedUserId, parsed.data.challengeId, parsed.data.code);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.code, retryAfterSeconds: result.retryAfterSeconds },
        {
          status: result.code === "too_many_attempts" ? 429 : 400,
          ...(result.retryAfterSeconds != null && {
            headers: { "Retry-After": String(result.retryAfterSeconds) },
          }),
        },
      );
    }

    enterStaffSecuritySelfPrincipal(verifiedUserId, "api/auth/specialist-signup/confirm:verified-self");
    try {
      await deps.staffSecurity.ensureProfile();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "security_setup_pending",
          message: "Почта подтверждена. Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.",
        },
        { status: 503 },
      );
    }
    const verifiedSessionUser = await deps.userByPhone.findByUserId(verifiedUserId);
    if (!verifiedSessionUser) {
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
    await setSessionFromUser({ ...verifiedSessionUser, role: "doctor" }, {
      staffSecurity: { assurance: "pending_enrollment" },
    });
  }

  if (establishedSession) {
    enterStaffSecuritySelfPrincipal(userId, "api/auth/specialist-signup/confirm:retry-self");
    try {
      await deps.staffSecurity.ensureProfile();
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

  let provisioned: Awaited<ReturnType<typeof deps.organizationProvisioning.provisionSpecialistOwner>>;
  try {
    const provisionUserId = userId;
    if (!provisionUserId) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    provisioned = await deps.organizationProvisioning.provisionSpecialistOwner({
      challengeId: parsed.data.challengeId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "specialist_signup_intent_not_found") {
      return NextResponse.json({ ok: false, error: "signup_intent_not_found" }, { status: 400 });
    }
    if (message === "specialist_signup_user_not_verified") {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "provisioning_pending", redirectTo: "/app/account?tab=security" },
      { status: 503 },
    );
  }

  const sessionLookupUserId = userId;
  if (!sessionLookupUserId) {
    return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
  }
  const sessionUser = await deps.userByPhone.findByUserId(sessionLookupUserId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  await setSessionFromUser({ ...sessionUser, role: "doctor" }, {
    staffSecurity: { assurance: "pending_enrollment" },
  });

  return NextResponse.json({
    ok: true,
    redirectTo: "/app/account?tab=security",
    organizationId: provisioned.organizationId,
    specialistId: provisioned.specialistId ?? null,
    membershipId: provisioned.membershipId,
  });
}
