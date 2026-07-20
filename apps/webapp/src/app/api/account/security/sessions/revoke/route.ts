import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffSecurityApiSession } from "@/app-layer/guards/requireRole";
import { setSessionFromUser } from "@/modules/auth/service";

export async function POST() {
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;
  if (gate.session.staffSecurity?.assurance !== "factor_verified") {
    return NextResponse.json({ ok: false, error: "verified_security_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  await deps.staffSecurity.revokeSessions();
  const user = await deps.userByPhone.findByUserId(gate.session.user.userId);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await setSessionFromUser(user, {
    staffSecurity: { assurance: "factor_verified", verifiedAt: Math.floor(Date.now() / 1000) },
  });
  return NextResponse.json({ ok: true });
}
