import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { confirmPublicEmailOtpChallenge } from "@/modules/auth/emailOtpPublic";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import { jsonError, jsonOk } from "@/shared/http/apiResponse";

const bodySchema = z.object({
  token: z.string().trim().min(16),
  code: z.string().trim().min(1).max(12),
  email: z.string().optional(),
});

function errorStatus(code: string): number {
  if (code === "too_many_attempts") return 429;
  if (code === "server_error") return 500;
  return 400;
}

function acceptErrorStatus(code: string): number {
  if (code === "seat_limit_reached") return 409;
  if (code === "entitlement_disabled") return 403;
  return 400;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/clinic/invites/accept/confirm:POST", request);
  if (!(await isAuthChannelEnabled("email"))) {
    return jsonError(AUTH_CHANNEL_DISABLED_ERROR, {}, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_body", {}, { status: 400 });
  }

  const deps = buildAppDeps();
  const lookup = await deps.organizationInvites.lookupPendingByToken(parsed.data.token);
  if (!lookup.ok) {
    return jsonError(lookup.code, {}, { status: 400 });
  }

  const suppliedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
  if (suppliedEmail && suppliedEmail !== lookup.invite.invitedEmail) {
    return jsonError("email_mismatch", {}, { status: 400 });
  }

  const otp = await confirmPublicEmailOtpChallenge(
    lookup.invite.invitedEmail,
    parsed.data.code,
    deps.emailOtpPublicDb,
  );
  if (!otp.ok) {
    return jsonError(
      otp.code,
      { retryAfterSeconds: otp.retryAfterSeconds },
      {
        status: errorStatus(otp.code),
        ...(otp.retryAfterSeconds != null
          ? { headers: { "Retry-After": String(otp.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  const accepted = await deps.organizationInvites.acceptInvite({
    token: parsed.data.token,
    platformUserId: otp.userId,
    expectedEmail: lookup.invite.invitedEmail,
  });
  if (!accepted.ok) {
    return jsonError(accepted.code, {}, { status: acceptErrorStatus(accepted.code) });
  }

  if (isPlatformUserUuid(accepted.platformUserId)) {
    enterStaffSecuritySelfPrincipal(accepted.platformUserId, "api/clinic/invites/accept/confirm:invite-verified-self");
  }
  const user = await deps.userByPhone.findByUserId(accepted.platformUserId);
  if (!user) {
    return jsonError("server_error", {}, { status: 500 });
  }

  // The current platform role model still promotes a staff invitee to `doctor` in
  // the accept transaction. Clinic authority is deliberately determined from the
  // membership role below, never from this coarse session role.
  await setSessionFromUser(user);

  return jsonOk({
    redirectTo: getRedirectPathForRole("doctor"),
    organizationId: accepted.organizationId,
    membershipId: accepted.membershipId,
    specialistId: accepted.specialistId,
    invitedRole: accepted.role,
  });
}
