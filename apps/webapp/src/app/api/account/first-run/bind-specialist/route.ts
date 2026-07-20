import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminWorkspaceApiContext } from "@/app-layer/guards/requireRole";

export async function POST() {
  const gate = await requireAdminWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  if (ctx.membershipRole !== "owner") {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  const security = await deps.staffSecurity.getStatus(ctx.session.user.userId);
  if (
    !security?.enrolled ||
    !security.recoveryConfirmed ||
    security.replacementRequired ||
    ctx.session.staffSecurity?.assurance !== "factor_verified"
  ) {
    return NextResponse.json({ ok: false, error: "verified_security_required" }, { status: 403 });
  }
  const specialistId = await deps.organizationProvisioning.ensureOwnBookableSpecialist({
    organizationId: ctx.organizationId,
    membershipId: ctx.membershipId,
    platformUserId: ctx.session.user.userId,
    membershipRole: ctx.membershipRole,
    specialistId: ctx.specialistId,
    displayName: ctx.session.user.displayName,
  });
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: "specialist_binding_failed" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, specialistId, redirectTo: "/app/doctor" });
}
