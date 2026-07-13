import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireClinicManagementApiContext } from "@/app-layer/guards/requireRole";

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const members = await deps.organizationMembership.listOrganizationMembers(gate.ctx.organizationId);

  return NextResponse.json({
    ok: true,
    members: members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
      specialistLinked: member.specialistId !== null,
    })),
  });
}
