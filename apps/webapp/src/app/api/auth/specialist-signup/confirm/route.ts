import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from "@/modules/auth/authConfirmRateLimit";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { getSpecialistSignupEnabled } from "@/modules/auth/specialistSignupRollout";
import { getCurrentSession, setSessionFromUser } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { validateOrganizationSlugCandidate } from "@/modules/clinic-directory/organizationSlug";
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from "@/shared/http/apiResponse";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
  organizationSlug: z.string().max(512).optional(),
});

const ORGANIZATION_SLUG_REQUIRED_MESSAGE =
  "Выберите публичный адрес клиники и повторите подтверждение. Код ещё действует.";

const PROVISIONING_ERROR_RULES = {
  specialist_signup_intent_not_found: { status: 400, code: "signup_intent_not_found" },
  specialist_signup_user_not_verified: { status: 400, code: "expired_code" },
  specialist_signup_slug_reservation_not_found: {
    status: 409,
    code: "organization_slug_required",
    publicFields: { message: ORGANIZATION_SLUG_REQUIRED_MESSAGE },
  },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/specialist-signup/confirm:POST", request);

  const rateLimit = await checkAuthConfirmRateLimit(request, "specialist_signup_confirm");
  if (rateLimit.limited) {
    if (rateLimit.reason === "proxy_configuration") {
      return jsonError("proxy_configuration", {}, { status: 503 });
    }
    // Same shape this route already returns below for `result.code === "too_many_attempts"`.
    return jsonError(
      "rate_limited",
      { retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC },
      { status: 429, headers: { "Retry-After": String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  if (!(await isAuthChannelEnabled("email"))) {
    return jsonError(AUTH_CHANNEL_DISABLED_ERROR, {}, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_body", {}, { status: 400 });
  }

  const specialistSignupEnabled = await getSpecialistSignupEnabled();
  if (!specialistSignupEnabled) {
    return jsonError("specialist_signup_disabled", {}, { status: 423 });
  }

  const deps = buildAppDeps();
  let userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(parsed.data.challengeId);
  let intent = await deps.organizationProvisioning.getSpecialistSignupIntentByChallengeId(
    parsed.data.challengeId,
  );
  let establishedSession = false;
  if (!userId) {
    if (!intent) {
      return jsonError("expired_code", {}, { status: 400 });
    }
    const session = await getCurrentSession();
    if (
      !session ||
      session.user.userId !== intent.userId ||
      session.user.role !== "doctor" ||
      session.staffSecurity?.assurance !== "pending_enrollment"
    ) {
      return jsonError("verification_required", {}, { status: 401 });
    }
    userId = intent.userId;
    establishedSession = true;
  }

  if (!intent) {
    return jsonError("expired_code", {}, { status: 400 });
  }

  if (intent.organizationSlug === null) {
    if (!parsed.data.organizationSlug) {
      return jsonError(
        "organization_slug_required",
        { message: ORGANIZATION_SLUG_REQUIRED_MESSAGE },
        { status: 409 },
      );
    }
    const organizationSlug = validateOrganizationSlugCandidate(parsed.data.organizationSlug);
    if (!organizationSlug.ok) {
      return jsonError(organizationSlug.code, {}, { status: 400 });
    }
    enterStaffSecuritySelfPrincipal(userId, "api/auth/specialist-signup/confirm:slug-recovery-self");
    try {
      const recovered = await deps.organizationProvisioning.replacePendingSpecialistSignupChallenge({
        challengeId: parsed.data.challengeId,
        organizationSlug: organizationSlug.slug,
      });
      if (!recovered) {
        return jsonError("signup_intent_not_found", {}, { status: 400 });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "slug_unavailable") {
        return jsonError("slug_unavailable", {}, { status: 409 });
      }
      throw error;
    }
  }

  if (!establishedSession) {
    const verifiedUserId = userId;
    if (!verifiedUserId) {
      return jsonError("expired_code", {}, { status: 400 });
    }
    const result = await confirmEmailChallenge(verifiedUserId, parsed.data.challengeId, parsed.data.code, "specialist_signup");
    if (!result.ok) {
      return jsonError(
        result.code,
        { retryAfterSeconds: result.retryAfterSeconds },
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
      return jsonError(
        "security_setup_pending",
        {
          message: "Почта подтверждена. Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.",
        },
        { status: 503 },
      );
    }
    const verifiedSessionUser = await deps.userByPhone.findByUserId(verifiedUserId);
    if (!verifiedSessionUser) {
      return jsonError("server_error", {}, { status: 500 });
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
      return jsonError(
        "security_setup_pending",
        {
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
      return jsonError("expired_code", {}, { status: 400 });
    }
    provisioned = await deps.organizationProvisioning.provisionSpecialistOwner({
      challengeId: parsed.data.challengeId,
    });
  } catch (error: unknown) {
    const mapped = mapApiError(error, PROVISIONING_ERROR_RULES, {
      status: 503,
      code: "provisioning_pending",
      publicFields: { redirectTo: "/app/account?tab=security" },
    });
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }

  const sessionLookupUserId = userId;
  if (!sessionLookupUserId) {
    return jsonError("expired_code", {}, { status: 400 });
  }
  const sessionUser = await deps.userByPhone.findByUserId(sessionLookupUserId);
  if (!sessionUser) {
    return jsonError("server_error", {}, { status: 500 });
  }

  await setSessionFromUser({ ...sessionUser, role: "doctor" }, {
    staffSecurity: { assurance: "pending_enrollment" },
  });

  return jsonOk({
    redirectTo: "/app/account?tab=security",
    organizationId: provisioned.organizationId,
    specialistId: provisioned.specialistId ?? null,
    membershipId: provisioned.membershipId,
  });
}
