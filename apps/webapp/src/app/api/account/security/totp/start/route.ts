import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffSecurityApiSession } from "@/app-layer/guards/requireRole";

export async function POST() {
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;
  // `staffSecurity` undefined = this session's login never set it (e.g. a global admin's
  // email-OTP login never has an existing `staff_security_profiles` row to derive an assurance
  // from) — that is the bootstrap case, equivalent to "never enrolled," and must be allowed to
  // start enrollment here (audited 2026-07-25). `startTotpEnrollment` itself calls `ensureProfile()`
  // and independently refuses when already fully enrolled, so this stays fail-closed.
  const assurance = gate.session.staffSecurity?.assurance;
  if (
    assurance !== undefined &&
    assurance !== "pending_enrollment" &&
    assurance !== "recovery" &&
    assurance !== "factor_verified"
  ) {
    return NextResponse.json({ ok: false, error: "security_session_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  const email = await deps.userByPhone.getVerifiedEmailForUser(gate.session.user.userId);
  if (!email) return NextResponse.json({ ok: false, error: "verified_email_required" }, { status: 409 });
  const result = await deps.staffSecurity.startTotpEnrollment({ email });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
