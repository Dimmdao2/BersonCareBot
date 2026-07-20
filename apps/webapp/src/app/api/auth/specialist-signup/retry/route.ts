import { NextResponse } from "next/server";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";

export async function POST() {
  stampBootstrapPrincipal("api/auth/specialist-signup/retry:POST");
  const session = await getCurrentSession();
  if (!session || session.user.role !== "doctor") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (
    session.staffSecurity?.assurance !== "pending_enrollment" &&
    session.staffSecurity?.assurance !== "factor_verified" &&
    session.staffSecurity?.assurance !== "recovery"
  ) {
    return NextResponse.json({ ok: false, error: "security_session_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  enterStaffSecuritySelfPrincipal(session.user.userId, "api/auth/specialist-signup/retry:self");
  const intent = await deps.organizationProvisioning.getLatestSpecialistSignupIntentForUser();
  if (!intent) return NextResponse.json({ ok: false, error: "signup_intent_not_found" }, { status: 404 });
  try {
    const provisioned = await deps.organizationProvisioning.provisionSpecialistOwner({
      userId: session.user.userId,
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
