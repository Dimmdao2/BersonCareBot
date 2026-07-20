import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";

export async function POST() {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;
  if (gate.session.staffSecurity?.assurance !== "factor_verified") {
    return NextResponse.json({ ok: false, error: "verified_security_required" }, { status: 403 });
  }
  const ok = await buildAppDeps().staffSecurity.confirmRecoveryCodes(gate.session.user.userId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}
