import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";

export async function POST() {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;
  if (
    gate.session.staffSecurity?.assurance !== "pending_enrollment" &&
    gate.session.staffSecurity?.assurance !== "recovery" &&
    gate.session.staffSecurity?.assurance !== "factor_verified"
  ) {
    return NextResponse.json({ ok: false, error: "security_session_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  const email = await deps.userByPhone.getVerifiedEmailForUser(gate.session.user.userId);
  if (!email) return NextResponse.json({ ok: false, error: "verified_email_required" }, { status: 409 });
  const result = await deps.staffSecurity.startTotpEnrollment({ userId: gate.session.user.userId, email });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
