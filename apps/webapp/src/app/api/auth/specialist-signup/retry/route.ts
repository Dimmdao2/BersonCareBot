import { NextResponse } from "next/server";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { getCurrentSession } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/specialist-signup/retry:POST", request);
  if (!(await isAuthChannelEnabled("email"))) {
    return NextResponse.json(
      { ok: false, error: AUTH_CHANNEL_DISABLED_ERROR },
      { status: 503 },
    );
  }
  const session = await getCurrentSession();
  if (!session || session.user.role !== "doctor") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.staffSecurity?.assurance !== "factor_verified") {
    return NextResponse.json({ ok: false, error: "security_session_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  enterStaffSecuritySelfPrincipal(session.user.userId, "api/auth/specialist-signup/retry:self");
  const intent = await deps.organizationProvisioning.getLatestSpecialistSignupIntentForUser();
  if (!intent) return NextResponse.json({ ok: false, error: "signup_intent_not_found" }, { status: 404 });
  try {
    const provisioned = await deps.organizationProvisioning.provisionSpecialistOwner({
      challengeId: intent.challengeId,
    });
    return NextResponse.json({
      ok: true,
      redirectTo: "/app/account?tab=security",
      organizationId: provisioned.organizationId,
      membershipId: provisioned.membershipId,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "provisioning_pending" }, { status: 503 });
  }
}
