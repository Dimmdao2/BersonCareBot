import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlement } from "@/app-layer/guards/requireEntitlement";
import { requireClinicManagementApiContext } from "@/app-layer/guards/requireRole";

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlement(gate.ctx, "clinic_team");
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [members, seats] = await Promise.all([
    deps.organizationMembership.listOrganizationMembers(gate.ctx.organizationId),
    deps.clinicSeats.getSeatStatus(gate.ctx.organizationId),
  ]);

  return NextResponse.json({
    ok: true,
    members: members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
      canManageOrganization: member.role === "owner" || member.role === "admin",
      specialistLinked: member.specialistId !== null,
      seatConsuming: member.role === "owner" || member.role === "doctor",
    })),
    seats,
  });
}
